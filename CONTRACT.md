# VOLEY 3D — Contrato de arquitectura

Juego de voley 2 contra 2 en 3D (Three.js r149), navegador, escritorio + móvil.
Proyecto personal. Este documento es la ley para los 7 especialistas (el 7.º, `net`, desde el online) que trabajan en paralelo.

## 1. Propiedad de ficheros (exacta)

```json
{"sim":"js/sim.js and js/ai.js (gameplay simulation, rules, AI, hit quality/timing, serve types, difficulty) and tools/simtest.js","players":"js/players.js and js/doll.js (athlete models, chibi doll geometry and atlas, look rendering and wardrobe preview, materials, procedural animation state machine, celebrations)","arena":"js/arena.js, js/venues.js, js/venue-*.js and js/fx.js (venue registry and maps, pavilion, floor, lines, net, antennas, posts, lighting, shadows, stands, crowd, LED boards, hanging scoreboard, ball mesh+shadow+trail, particles/impact FX)","camera_input":"js/camera.js and js/input.js (third-person camera rig, transitions, shake, slow-mo hook, camera-relative input mapping, keyboard, gamepad, touch controls overlay)","audio":"js/audio.js (procedural WebAudio: hit sounds per touch type, spike crack, net, block, whistle, crowd ambience and reactions, UI clicks, music sting)","ui_main":"index.html, css (inline in index.html), js/ui.js, js/main.js and js/look.js (wardrobe catalog and save; boot, loop, renderer setup, adaptive quality, menus, HUD, scoreboard overlay, pause, end screen, settings, tutorial/onboarding, debug scenes, tools/shot.sh, tools/console.sh)","net":"js/net*.js (online mode: session, rollback, transport, rooms, mirror view js/netview.js) and tools/mptest.js, tools/net*.js, tools/viewtest.js, tools/roomtest.js; notes in notes/net.md"}
```

`js/prog.js` (estadísticas y progresión de tus jugadores: `VB.Prog`, guardado en `voley3d.squad`) también es de **ui_main**; sim lo recibe ya convertido en `createGame({attrs: [[st7, st11], [st3, st9]]})` (atributos 1-99 con las claves `VB.ATTR_KEYS`; 50 = neutro; sin `attrs` la sim no cambia), que deja `p.st`, `p.prof` (perfil de IA, `Sim.statProf`) y `p.ak` (multiplicadores del humano, `Sim.attrK`; constantes en `VB.ATTR_K`). Integración (10-nov-2026): `p.ak` añade `eRecv/eDig/eSet/eAtk` (precisión del toque: dispersión ×1,5-0,6 y calidad del pase/colocación) y `rRecv/rDig` (alcance del 1r toque ×0,94-1,05); con Velocidad < 50 frenar y girar es al momento (la rampa `accT` solo al arrancar).
`tools/drive.js`, `tools/eval.js`, `tools/shot.js`, `tools/cdp.js`, `tools/chrome.js`, `tools/chrome-env.sh`, `tools/perf.js`, `tools/touchplay.js` y `tools/padplay.js` también son de **ui_main**.
`tools/kittest.js` (equipaciones: líbero de club y 2ª equipación del rival en la Carrera de pista; node puro) es de **players**. Equipaciones de club (12-nov-2026): `Players.setKit(st)` acepta `st.kitLibero` y `st.rival.kitLibero` (color del líbero del club; se usa si se distingue de las dos camisetas) y, con `kitLibero` en `st.rival` (solo la Carrera de pista), viste al rival con su 2ª (camiseta = `kitAccent`) cuando su 1ª se parece a la tuya. `Players.rivalKit(st)` (sin aplicar nada) dice qué vestirá: `{kind:'1a'|'2a'|'cpu', …}`; el hub de pista enseña con él la 2ª.
Vida en la pista (12-nov-2026): los textos de decisiones guardados en `c.life.log` y los logros de `sum.life.ach` salen con el nombre de pabellón; el reto «tidy» de la playa (L0, n = 1) dice ahora «Gana con un error como mucho» (antes «Gana con 1 errores o menos»), único texto de playa que cambia; el objetivo de patrocinio de pista cuenta las jornadas que juegas (sin descansos de una liga impar).
`tools/audiotest.js` es de **audio**; `tools/touchtest.js`, `tools/padtest.js` y `tools/courttest.js` son de **camera_input**.
`js/badges.js` (`VB.Badges`, insignias), `js/career.js` (`VB.Career`, datos y lógica de la Carrera, sin DOM), `js/career-ui.js` (`VB.CareerUI`, pantallas de la Carrera: crea su propio DOM `#career` y su `<style>` desde JS), `js/career-life.js` (`VB.CareerLife`, «vida» de la Carrera: retos, fama, patrocinios, decisiones, rival, tienda, premios, logros y legado; sin DOM) y `js/career-life-ui.js` (`VB.CareerLifeUI`, pestaña «Fama») son de **ui_main**, igual que `js/leagues.js` (`VB.Leagues`, datos de las ligas de pista; GENERADO por `tools/build-leagues.js` desde `notes/clubes/*.json`, no se edita a mano), `tools/build-leagues.js`, `tools/leagues-fixture.js`, `tools/badgetest.js` y `tools/careertest.js`. Guardados: `voley3d.squad` (v3: escuadrón inicial a media 50; los v1/v2 suben +10 cada atributo una vez), `voley3d.career` (playa, con `c.life`), `voley3d.career6` (pista, también con `c.life` desde el 12-nov-2026; un guardado sin él lo crea al cargar), `voley3d.career.mode` (cuál está activa) y `voley3d.legends` (Salón de la Fama).

**Sprint 5 (12-nov-2026).** Nuevos de **ui_main**: `js/version.js` (`VB.VERSION/VERSION_DATE/CHANGELOG/CREDITS`), `js/gym.js` (`VB.Gym`,
guardado `voley3d.gym`), `js/career-world.js` (`VB.CareerWorld`: Faro el mentor, noticias de la liga, anales y fichas de club; sin DOM) y
`js/career-world-ui.js` (`VB.CareerWorldUI`), y las herramientas `tools/og-image.js` (→ `pages/og.png`), `tools/abouttest.js`,
`tools/gymtest.js` y `tools/settest.js`. `tools/keytest.js` es de **camera_input**; `tools/animtest.js` de **players**;
`tools/fp-mastery.json` (huella de la maestría, `node tools/fingerprint6.js --variant mastery`) de **sim**. Guardados nuevos:
`voley3d.gym` (v1 `{v, d:{id:{b,m,n,t}}, free:{rally}, xp:{id:nivel}}`; va a `DOCS` desde que Ferran desplegó las reglas con `'gym'` el
12-nov-2026: `GYM_SYNC = true` en account.js), `voley3d.device` (ajustes del aparato: `resScale, fpsCap, showFps, touchSize,
padDead`), `voley3d.seen` (`{v}`: última versión cuyas Novedades se vieron), `voley3d.retoauto` (AAAAMMDD: día en que Retos › Hoy ya se abrió solo
al entrar; ui.js `retoAuto`, 16-nov-2026) y `voley3d.e1tips` (consejos de maestría vistos); estos NUNCA van a `DOCS`. Dentro de `voley3d.career` (sin subir VER): `c.world` (`mentor{on,seen,last,q[≤3]}`, `h2h`, `since`, `news[≤60]`, `newsN`,
`newsSeen`, `annals[≤40]`, `lead`, `tpl`; ≈ 13 KB a 12 temporadas) y `c.life.celeb` / `c.life.celebAnn`.

**Vestuario (rama personaliza, 13-nov-2026).** `js/look.js` (`VB.Look`: catálogo, compatibilidades, saneado, resolución del aspecto,
inventario y guardado; puro, sin THREE ni DOM) es de **ui_main**, igual que `tools/looktest.js`. `js/doll.js` (el muñeco: geometría,
atlas, ranuras del Vestuario y `VB.Doll.preview`) es de **players** (ya lo era en la práctica; ahora consta en el JSON). Guardado nuevo
`voley3d.look` (perfil global, < 8 KB): `{v:1, fits:[fitN1, fitN2], own:{id:{s:'carrera'|'tienda'|'gym'|'record', t:ms}}, seen:{id:1}}`;
no se escribe hasta la primera edición o el primer desbloqueo. Va a `DOCS` (`LOOK_SYNC = true` en account.js;
reglas con `'look'` desplegadas el 15-nov-2026). Dentro de la Carrera
(sin subir VER): `c.life.look` (fit de tu jugador o `null` en los guardados de antes: cara de siempre hasta guardar), `c.life.lookAnn` y
`c.life.spentLook`. Detalle en «Vestuario» al final, en notes/ui_main.md y en notes/players.md.

**Sprint 2-4 (15-nov-2026, v1.2.0: «Tu carrera», «Partidos que se recuerdan», «Volver mañana»).** Nuevos de **ui_main**:
`js/recap.js` (`VB.Recap`: el único módulo narrativo; previa, titular, frase de la jugada y modelo de la hoja final; puro),
`js/retos.js` (`VB.Retos`: 18 retos de maestría y el reto del día), `js/profile.js` (`VB.Profile`: nivel de perfil, hitos y álbum),
`js/replay.js` (`VB.Replay`: repeticiones por resimulación, sin guardado) y las pruebas `tools/recaptest.js`, `tools/retotest.js`,
`tools/proftest.js`, `tools/synctest.js`, `tools/replaytest.js`, `tools/lifetest.js` y `tools/worldtest.js`. De **players**:
`tools/contacttest.js` (contactos mano-balón por CDP). `firebase/firestore.rules` (ui_main) admite ya las 11 claves de `DOCS`, **desplegadas el 16-nov-2026** (comprobado: lo publicado en make-the-cut-vb es igual que el fichero).
Guardados nuevos: `voley3d.retos` (v1) y `voley3d.profile` (v1) sincronizan solo con `S4_SYNC = true` en account.js. Hoy es `false`: ellos,
`voley3d.career6`, `voley3d.career.mode` (`cmode`) y `voley3d.legends` van a `TRACK` (hora sin subir). `voley3d.retostab` (pestaña de Retos),
`voley3d.devid` (contador del perfil por aparato), `<clave>.bak` (copia de un guardado dañado) y `voley3d.career(6).prev` (la Carrera local
que pierde ante la de la cuenta) NUNCA van a `DOCS` ni a `TRACK`. `record.byD` (`{easy|normal|hard|expert:[g,p]}`) va dentro de
`voley3d.record` y `settings.replays` ('auto'|'end'|'off', por defecto 'auto') dentro de `voley3d.settings`. Dentro de las Carreras (sin
subir VER): `c.life.boss` (`{b0..b4: {k, name, nick, style, num, club, w, l, beat, seen}}`), `c.life.bossW`, `c.life.rival.style`, `chemLv`
(en `c.mate`/`c.squad[i]` en la playa y `c` en la pista: último nivel de química avisado), `l.jN`, `l.rareJ`, `l.rareN`, `l.chemEv`, `l.sign`
y `c.ts.md`. Interruptores de account.js: `GYM_SYNC = true` (12-nov-2026; donde una nota diga `false`, es errata), `LOOK_SYNC = true` (15-nov-2026) y
`S4_SYNC = false` (orden: Ferran despliega las reglas y luego lo enciende en una publicación mínima).
**Contrato de guardados (D4):** un guardado ilegible se copia en `<clave>.bak` y el módulo devuelve `lost()` (la interfaz avisa una vez);
uno con `v` mayor que el del código se lee en memoria, `readOnly()` es true, no se escribe y `mergeRaw` nunca lo rebaja. Lo cumplen
`VB.Prog`, `VB.Gym`, `VB.Look`, `VB.Profile` y `VB.Retos`. Las bajadas de la cuenta solo se aplican en el menú (`VB.Account.menuReady()`).
Detalle por tarea en `notes/s234/T*.md` (se conservan tal cual); el resumen por dueño, en `notes/<dueño>.md` («Sprint 2-4»).

**Reglas**
- Cada especialista edita SOLO sus ficheros. Nada de tocar ficheros ajenos "solo una línea".
- Si necesitas algo en un fichero ajeno, escríbelo en `notes/<owner>.md` (p. ej. `notes/ui_main.md`)
  con: qué, por qué, firma exacta propuesta. El integrador lo aplica.
- Nuevas capacidades se exponen como funciones OPCIONALES en tu propio módulo (main.js llama a todo
  con guarda: si la función no existe, no pasa nada). Lee de otros módulos solo con guarda
  (`VB.Players && VB.Players.rigOf && ...`).
- Nunca romper las interfaces de la sección 4. Puedes AÑADIR campos a eventos/estado (sim) o funciones (todos).
- Sin `alert/confirm/prompt`, sin `window.print`, `localStorage` solo dentro de try/catch.
- No crear ficheros nuevos de JS sin pasar por `notes/ui_main.md` (index.html carga la lista fija).

## 2. Restricciones técnicas

- Scripts clásicos (`<script src>`), SIN módulos ES, sin import/export, sin bundler. Un único espacio global `window.VB`.
- Orden de carga (index.html, sprint 2-4): `three.min.js` (cdnjs 0.149.0) → `js/version.js` → `js/account.js` → `js/sim.js` → `js/ai.js` →
  `js/ai6.js` → `js/prog.js` → `js/gym.js` → `js/badges.js` → `js/retos.js` → `js/look.js` → `js/profile.js` → `js/venues.js` → `js/arena.js` → `js/venue-*.js` (sedes: `venue-fanals.js`, `venue-moll.js`, `venue-canrebot.js`, `venue-cupula.js`) → `js/fx.js` → `js/players.js` → `js/doll.js` → `js/camera.js` →
  `js/input.js` → `js/audio.js` → `js/leagues.js` → `js/career.js` → `js/career-life.js` → `js/career-life-ui.js` → `js/career-world.js` →
  `js/career-world-ui.js` → `js/career-ui.js` → `js/recap.js` → `js/replay.js` → `js/ui.js` → `js/install.js` → `js/main.js` (main arranca).
  recap.js, retos.js, profile.js y replay.js son puros (sin DOM ni THREE) y se cargan también en node para las pruebas. gym.js lee `VB.DRILL` (sim) de forma
  perezosa. Favicon como data URI en index.html (build-pages lo quita en Pages y pone el suyo).
- **Versión:** cada publicación visible sube `VB.VERSION` (semver) y añade su entrada al principio de `VB.CHANGELOG` (js/version.js);
  `tools/build-pages.js` falla si `CHANGELOG[0].v !== VERSION`, si falta `pages/og.png` o si no hay exactamente un `rel="icon"`.
- Three.js: `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.149.0/three.min.js` (verificado 200; r149 es el último sin aviso de deprecación del build UMD).
  API r149: `outputEncoding`/`sRGBEncoding`, `CapsuleGeometry` disponible, `THREE.ColorManagement.legacyMode = false` (lo pone main.js:
  los hex de materiales son sRGB; **toda textura de color de canvas debe llevar `tex.encoding = THREE.sRGBEncoding`**).
- Cero peticiones de red en tiempo de ejecución salvo three.js y Google Fonts. Texturas procedurales (canvas) o data URIs.
- `index.html` sin `<!doctype>/<html>/<head>/<body>`; empieza por `<title>Make the Cut</title>`. Debe funcionar en `file://` y como Artifact.
- Sim (`sim.js`, `ai.js`) pura: sin DOM, sin THREE, sin `window` salvo vía el objeto VB
  (`var root = (typeof window!=='undefined')?window:globalThis; var VB = root.VB = root.VB || {}`).
- Rendimiento: 60 fps objetivo en móvil medio. Sin asignaciones por frame en bucles calientes (reutiliza Vector3/objetos),
  instancing para multitudes, respeta `ctx.quality`.
- Campos numéricos de objetos de larga vida (partido, jugadores, rigs, pools): si un campo nace entero (`0`, `-1`, `-99`) y luego recibe
  doubles, generalizarlo al crear el objeto (`dblFields(o)` en sim.js/players.js/fx.js; camera.js usa `0.5` y reasigna). Si no, V8 depreca el
  mapa en mitad del peloteo y desoptimiza a la vez el código caliente de todos los módulos.

## 3. Coordenadas

**Simulación (metros, z arriba):**
- `x` = largo. Red en `x = 0`. Equipo 0 (humano, rojo/naranja) en `x > 0`; equipo 1 (CPU, azul) en `x < 0`. Fondos en `x = ±9`.
- `y` = ancho. Laterales en `y = ±4.5`. Antenas en `y = ±4.5`, postes en `y = ±5.5`.
- `z` = altura. Suelo `z = 0`, borde superior de la red `z = 2.43` (`VB.C.NET_H`).
- `VB.Sim.side(team)` = `+1` (equipo 0) / `-1` (equipo 1).

**Three.js (y arriba):** `three.x = sim.x`, `three.y = sim.z`, `three.z = -sim.y` (base dextrógira).
Usar SIEMPRE `VB.toThree(x, y, z, out)` (acepta un `THREE.Vector3` o `{x,y,z}`; sin `out` devuelve un objeto nuevo: no usar así en bucles)
y `VB.fromThree(tx, ty, tz, out)`.
- Un modelo construido mirando a `+X` local con `rotation.y = atan2(simDy, simDx)` mira hacia la dirección de simulación `(simDx, simDy)`.
- Plano en el suelo: `PlaneGeometry` + `rotation.x = -PI/2`; luego `position.x = sim.x`, `position.z = -sim.y`.

**Pantalla/cámara (entrada):** `mx` derecha +, `my` hacia la red (arriba en pantalla) +.
main.js convierte con `VB.CameraRig.getBasis()` = `{fx, fy, rx, ry}` (adelante y derecha de la cámara en el suelo, coords de sim):
`world = (rx*mx + fx*my, ry*mx + fy*my)`. Con la cámara detrás del equipo humano: adelante = `(-1,0)`, derecha = `(0,1)`.

## 4. Interfaces

### 4.1 Contexto compartido `VB.ctx` (lo crea main.js)
| campo | descripción |
|---|---|
| `THREE, renderer, scene, camera` | motor; `camera` es `PerspectiveCamera` (la mueve camera.js) |
| `canvas, container` | `#stage` contiene el canvas WebGL |
| `width, height` | tamaño CSS actual del contenedor |
| `quality` | `{level:'high'|'medium'|'low', rank:2|1|0, pixelRatio, shadowSize:2048|1024|512, shadows, antialias, crowdDensity:1|0.7|0.4}` |
| `isTouch, isMobile` | detección (forzado con `?debug=mobile`) |
| `state` | `'menu' | 'playing' | 'paused' | 'over'` |
| `game` | partido actual (`VB.Sim.createGame`); en el menú es un partido demo CPU vs CPU |
| `timeScale` | escala del tiempo de juego; la gestiona camera.js (cámara lenta). main.js la aplica |
| `realDt, gameDt, time, frame, fps` | tiempos del frame (`time` real acumulado) |
| `debug, params, frozen` | escena de depuración, parámetros de URL, simulación congelada |
| `portraitBlock` | móvil en vertical en partido: la sim se detiene y UI muestra "Gira el móvil" |
| `renderFn` | si no es null, main.js llama `renderFn(ctx)` en vez de `renderer.render(scene,camera)` (post-proceso de arena) |
| `settings` | `{muted, difficulty, quality:'auto'|'high'|'medium'|'low', showHelp (avisos «¡Golpea!»/«¡Salta!»), setPoints (11 | 15 | 21 | 25, por defecto 25: Partido rápido; main.js lo pasa a Sim.createGame como `points`, set decisivo a min(15, points), ver `Sim.setTarget`), ctrlMode ('both' \| 'one', por defecto 'both': fila «Controlar» de la preparación del Partido rápido (en la Carrera siempre 'one'), «A los dos jugadores» / «Un jugador»; main.js lo pasa a Sim.createGame como `ctrl`), format ('2v2' \| '6v6', por defecto '2v2': fila «Formato» de la preparación del Partido rápido y tarjeta «6 contra 6» de Jugar (sprint 3 del 6v6); con '6v6' main.js crea `createGame({format:'6v6', ctrl:'one', ctrlRole:'OH'})` en el pabellón (forceVenue) sin atributos ni insignias del escuadrón; Escenario y Controlar quedan fijos), ctrlPlayer (en desuso: loadSettings lo fuerza a 0; la fila se lee «Controlar ‹ a los dos jugadores ›» / «Controlar ‹ un jugador ›» —en filas estrechas «a los dos»— y en modo Uno llevas siempre al n.º 1), coachTips (true: consejos del partido; ui.js lo pone a false al ganar el 1r partido), camStable (false: con true el temblor de cámara es 0), rumble (true), hudScale (1 \| 1.15 \| 1.3), softFlash (false: destellos de luz y flashes suaves; arena/fx leen `ctx.settings.softFlash === true` cada frame), arena ('hall' \| 'beach', por defecto 'beach' desde el 10-nov —'hall' en `?debug`—: fila «Escenario» de la preparación del Partido rápido (menús v2; ya no está en Ajustes), Palau del Mar / Platja Llarga; `?map=beach` lo fuerza en pruebas; arena.js lo aplica con `onSettings(s, 'arena')`)}` persistido en localStorage (validado en `loadSettings`) |
| `introLeft`, `introSkipReq` | tarjeta de presentación del partido (UI-14): s reales que quedan (> 0 mientras se ve; la sim está PARADA y los eventos iniciales salvo `newMatch` se retienen hasta que acaba) / petición de saltarla |
| `uiDock` | `{side:'left', frac}` con la hoja final acoplada (pantallas ≥ 1000 px; `frac` = borde derecho / ancho) o `null`; lo publica ui.js cada 8 frames y lo lee camera.js (CAM-10) |
| `actions` | `startMatch(opts), toMenu(), pause(), resume(), togglePause(), restart(), setSetting(k,v), toggleMute()`. Un `startMatch` HUMANO pedido mientras el arranque aún ensaya estilos (`VB.UI.bootBusy()`) espera a que acabe (`startWait`, tope 9 s); los de autopilot empiezan al momento |
| `shake(amount, dur)`, `slowmo(scale, realSeconds)` | atajos hacia camera.js |
| `simMove` | `[wx, wy]` entrada de MUNDO del frame (la misma matriz que recibe `Sim.step`; FX la lee para la retícula de apuntado) |
| `endHold` | lo escribe ui.js: celebración de victoria en curso antes de la tarjeta final (main.js pinta a ritmo completo) |
| `canvasAA`, `prewarm(mode)`, `prewarmMs` | MSAA del lienzo; precalentado de texturas al arrancar/empezar partido (ver notes/ui_main.md) |
| `prewarmInfo()` | `{n, total, issueMs, waitMs, pending, drawMs}`: programas precompilados en paralelo bajo el telón (`KHR_parallel_shader_compile` con `VB.Arena.prewarmList()`; sin la extensión, `VB.Arena.prewarmCompile()`) y el render de calentamiento (`warmDraw`). `&warmdraw=0`, `&prewarm=sync`, `&bootwait=0` (pruebas) |
| `frameMs`, `frameMsAvg` | coste JS del último frame / media de la ventana de 2 s (calidad adaptativa y `tools/perf.js`) |
| `qLog` | cambios de calidad adaptativa `{t, rt, level, scale, pr, fps, js, why}` (`rt` = s reales desde el arranque; `t` = `ctx.time`, que va por detrás con frames recortados). `why` incluye `'escala deshecha (xN)'` |
| `cpuBusy` | fracción ocupada del hilo principal en la ventana: máx.(JS del juego / intervalo, suma de tareas largas / 2 s; PerformanceObserver `longtask`). Decide si la escala de render ayuda |
| `fixShadowDepth()` | pone un `customDepthMaterial` compartido por variante a `SkinnedMesh`/`InstancedMesh` (evita recompilar el material de profundidad 4 veces por frame). Llamarlo si se crean casters nuevos después de `onGameStart`/`setQuality` |
| `bootInfo` | tiempos del arranque por módulo en ms (`{t0, renderer, yield, Arena, FX, …, quality, end}`; UI-07) |
| `window.__vbFontFaces` | lo deja el script en línea de index.html: número de caras de Google Fonts cargadas DE VERDAD (0 si falla la red). Para comprobar fuentes, usar esto o buscar en `document.fonts` una cara con `status === 'loaded'`; nunca `document.fonts.check()` (da true sin ninguna cara) |

**Sprint 5 en `VB.ctx`** (main.js): `reduceMotion` (booleano, propiedad PROPIA de ctx: `settings.lessMotion` 'on'/'off', o con 'auto'
`prefers-reduced-motion`; lo leen ui.js `rm()`, camera.js y fx.js), `renderScale` (escala de render vigente), `actions.resetSettings(keys[])`
(restablece un apartado de Ajustes), `bootInfo.version`. `actions.startMatch({drill, autopilot})`: con `drill` = 'serve'|'recv'|'set'|'atk'|
'block'|'free' arranca el Entrenamiento (2v2 siempre; Normal y control 'one' salvo en 'free'; `g.gym` = id, marca de main.js);
`drillEnd` → `state 'over'`; `restart()` repite el ejercicio. URL `&drill=<id>`, `&gymauto=1` (la IA juega por ti), `&nonews=1` (sin
Novedades automáticas), escenas `debug=drill_serve|drill_recv|drill_set|drill_atk|drill_block|drill_free|drill_end` (`&n=` repetición,
`&t=` s). startMatch pasa `mastery: !6v6 && !autopilot` y `aimSet` a createGame, y en cada partido humano llama
`VB.Players.setSignature(VB.CareerLife.signatureNow())` y `setRival(rivalNum | -1)` (en el duelo de la Carrera `nums[1] = [rivalNum, null]`).
`settings` añade (validadas en `loadSettings`, por defecto en `DEFAULTS()`): `volume`, `crowdVol` (migración única: 0,85 × `sfxVol`),
`resScale` (0 = auto, 1, .85, .7, .5: fija la escala y para la escala adaptativa), `fpsCap` (0 \| 30; con 30 la calidad adaptativa baja
por debajo de 26 fps y no sube), `showFps`, `camDist` ('near' \| 'normal' \| 'far'), `camCuts` ('all' \| 'less'), `lessMotion` ('auto' \|
'on' \| 'off'), `cbColors`, `ballStyle` ('clasico' \| 'contraste'), `keys` / `padKeys` (objeto plano con solo las diferencias; ≤ 12
acciones), `padDead` (0,1-0,3, por defecto 0,18), `touchSize` (1 \| 1,15 \| 1,3), `aimSet` (true: colocación dirigida de E1), `msTiming`
(false: sello en ms). `DEVICE_KEYS` van a `voley3d.device`, no a `voley3d.settings`.

**Vestuario en `VB.ctx`** (main.js, 13-nov-2026): `noteHitch()` (la ventana de fps en curso no cuenta para la calidad adaptativa:
`aq.skip = 1`), `actions.showroom(on, L, o)` (vista previa del Vestuario en el menú; ver «Vestuario» al final) y `actions.looksChanged()`
(el Vestuario guardó: la demo del menú se viste con los looks nuevos).

**Sprint 2-4 en `VB.ctx`** (main.js, 15-nov-2026):
- `replay`: `{phase:'prep'|'in'|'play'|'out', kind:'set'|'match'|'best', i, n}` o null. Lo escribe SOLO `VB.Replay` (objeto reutilizado);
  ui.js, input.js y main.js lo leen (input.js oculta los mandos táctiles; ui.js tapa la hoja final y el HUD).
- `replaySkipReq`: petición de ui.js (toque o «Salir»): `true` = saltar la jugada; `'all'` = salir de todas. main.js (`rpInput`) la consume.
- `actions.portrait(req)` → `{key, url}` (cola de retratos: `url` al momento si está en la caché LRU de 12 URL `blob:`; si no, encola y
  avisa con el evento DOM `vb-portrait` `{key, url}`), `actions.portraitDrop(key)`, `portraitInfo()` (pruebas: `{queue, cached, n, ms, warm,
  freed}`). Los retratos solo se pintan en `'menu'`/`'over'`, nunca en `'playing'` (R8: la previa usa los ya precargados).
- `actions.playBest(i?)`: mejores jugadas desde la hoja final (`VB.Replay.playBest(i, VB.UI.replayDone)`); solo en `'over'`.
- `actions.startMatch(opts)` admite además `map` (id de sede fuera de la Carrera; 6v6 solo sedes de pabellón), `noAttrs`, `noBadges`,
  `reto` (→ `g.reto` y `g.retoOpts`, copia de opts para «Otra vez») e `introKind` ('mini'|'short'|'long'). Los partidos humanos crean la
  partida con `stats: true` (R21: escritura sola; comprobado que no cambia la sim). `restart()` (R16): ejercicio de la Carrera →
  `startCareerDrill`; reto → `startMatch(retoOpts + {introKind:'mini'})`; Carrera → la previa normal; Partido rápido → las mismas opciones
  con previa mini.
- `settings.replays` ('auto' = automáticas en los puntos de set y de partido y la pestaña «Jugadas»; 'end' = solo la pestaña; 'off' = nada).
- `&slow=0.5` (depuración): ritmo fijo de la sim en vivo.

### 4.2 Simulación `VB.Sim` (sim.js) + `VB.AI` (ai.js) + `VB.C` (constantes)
- `createGame(opts)` → `game`. `opts = {demo, autopilot, seed, difficulty ('easy'|'normal'|'hard'|'expert' = Fácil/Normal/Difícil/Experto, alias castellanos; orden en `VB.DIFF_ORDER`, nombre visible `VB.DIFF[k].name`), serveClock (false = sin regla de 8 s), stats, rookie (primer partido: la CPU saca más suave; sin efecto en Difícil/Experto), present (pausas de presentación del punto, SIM-03: main.js lo pone en partidos humanos sin autopilot), ctrl ('both' por defecto: el control pasa a quien da el siguiente toque; 'one': el humano lleva siempre a `teams[0][0]` y la IA al compañero en todo, saque incluido, sin eventos `switch`; queda en `g.ctrlMode`; main.js lo toma de `ctx.settings.ctrlMode`), ctrlIdx (0 \| 1, solo con ctrl 'one': 0 = `teams[0][0]` n.º 1, 1 = `teams[0][1]` n.º 2; queda en `g.ctrlIdx`; con 1 el orden de saque del equipo 0 va en espejo; el juego pasa siempre 0, el 1 solo con `&ctrlidx=1` o `opts.ctrlIdx` en pruebas), ctrlRole ('OH': 6v6, sprint 3; puesto del jugador del humano, el primero de ese puesto = OH1, n.º 2; v1 solo el receptor, `CTRL_ROLES6` en sim.js; queda en `g.ctrlRole`, '' en 2v2. En 6v6 sin `demo` `ctrlMode` es siempre 'one')}`.
  `demo`: CPU vs CPU (menú). `autopilot`: partido "humano" pero el equipo 0 lo juega la IA (escenas de depuración).
- `step(game, dt, input)` — paso fijo `1/120`. `input` en coords de MUNDO: `{move:[wx,wy] (|v|≤1), hit, jump, jset, switchPlayer}`;
  `hit/jump/jset/switchPlayer` son flancos (pulsado en este paso). En saque humano: `move` desplaza al sacador a lo ancho y apunta.
  `jset` (COLOCAR, opcional): en el suelo y en el saque = `jump`; en el aire = **colocación en salto** (ver «Colocación en salto» abajo).
- `drainEvents(game, outArray)` — mueve los eventos pendientes a `outArray`.
- `predict(game, zt, out)`, `predictLanding(game, out)`, `focusPoint(game)` (pr1 o pr3 según toque), `canReach(game, p)`, `other(game, p)`, `side(team)`, `isHuman(game,p)`.
- **Estado de `game`** (lectura para todos): `mode ('serve'|'rally'|'point'|'over')`, `demo`, `autopilot`, `time`,
  `players[4]`, `teams[2][2]`, `ball {x,y,z,vx,vy,vz,held,spin,speed}`, `score[2]`, `sets[2]`, `setNo`, `setScores[[a,b]...]`,
  `serving`, `serverIdx`, `touchTeam`, `touches`, `lastPlayer`, `lastTeam`, `lastKind`, `ctrl` (jugador humano), `jobs[2]`,
  `pr1`/`pr3` (`{x,y,z,t}` cruce a 1 m / 3 m bajando), `setPoint`/`matchPoint` (equipo o -1), `finished`, `lastPoint`, `rally {t, hits}`.
- **Jugador**: `{id, team, idx, num, x,y,z, vx,vy (velocidad real), vz, anim, cool, onGround, lastAction, actionT}`
  `lastAction ∈ '' | 'pass' | 'set' | 'spike' | 'free' | 'serve' | 'block' | 'swing' | 'jump' | 'toss' | 'dive'`, `actionT` = segundos desde entonces.
  Añadidos: `down` (>0 = en el suelo tras plancha), `shot` (subtipo del último toque; dejada = `lastAction 'spike'` + `shot 'tip'`), `grade`,
  `jvx/jvy` (deriva en el aire), `lvx/lvy` (impulso de plancha).
- **Añadidos al estado** (ver notes/sim.md §2): `difficulty`, `prof[team]`; saque: `server`, `serveState ('ready'|'toss')`, `serveJump`,
  `serveAuth` (ya pitó el árbitro), `serveClock` (s que quedan de los 8), `serveT`, `tossT`, `jumpAt`; gesto humano: `hitBuf`, `swingLive`, `swingShot`, `swingAim/swingHasAim`;
  `digMargin` (s; margen de defensa del último remate: >0 el defensor llega con tiempo, <0 al hueco); `lastLand` (`{x,y,inside,t}` primer bote del rally, `null` desde `serveReady`);
  `jobMem/jobMemT/jobSwT/jobHop` (memoria interna de la IA para quién va al balón);
  `lastGrade`, `lastShot`, `lastTouchT`, `netSince`; balón: `ball.dip`, `ball.wobA/wobF/wobP` (baile del flotante).
- **Revisión 2**: `g.tm` (`{assist, swing, lock}` ayuda de timing del humano por nivel, `VB.TIMING[nivel]`); `g.defRole` (`''|'dig'|'block'`:
  al colocar la CPU el humano defiende y su compañero bloquea; CAMBIAR durante la colocación = bloquear tú); `g.recvRisk` (dificultad del
  último saque para el receptor); `g.blockBy` (último bloqueador); `g.courtSwap3` (ya se cambió de campo a los 8 del 3r set);
  `p.shot` admite `'body'` (el balón le da en el cuerpo: cuenta como toque).
- **R4 (verificación de reglas)**: `g.atkServe` (`{team, player}`: ataque del saque rival por encima de la red en zona de ataque pendiente; solo es falta si el balón cruza entero el plano de la red o lo toca el bloqueo rival; se borra en cada toque y en `serveReady`); `rookie` tiene efecto real en Fácil/Normal (`rookieProf(pr, on, diff)`: en Fácil solo saque suave y `srvErr` ×0,65; en Normal además remate un 10 % más lento, `atkErr` ×1,4, `aimNoise` ×1,25, `dig` ×0,8, `block` ×0,5).
- **R5 (verificación 2)**: criterio único de remate `isAttackContact(p, b)` (interno: `p.z > 0,25 && |b.x| < 3,8 && b.z > NET_H + 0,1`) que usan `hit()` y `aimPoint()` (la retícula promete el mismo tipo de golpe que sale). Un saque/remate que roza la cinta y cae dentro sin que nadie lo toque es `how:'ace'|'kill'` (ya no `'error'`).
- **Revisión 3**: `g.antennaHit` (`{x,y,z}` del contacto con la antena en este punto, o null; se borra en `serveReady`); `g.aimIn`/`g.aimOn`
  (dirección de apuntado de la entrada del último paso); `VB.DIFF.demo` (perfil de la demo del menú, fuera de `VB.DIFF_ORDER`).
- **Pulido ola 1 (SIM-01/02/03)**: estado nuevo `present` (bool), `hold` (s de la pausa en curso; `g.timer` arranca con él), `streakTeam/streakN`, `rally.digs`,
  `atkHuman/atkGrade`. `g.lastPoint` copia `team, reason, text, how, highlight, digs, streak, savedSetPoint, signal, touchedOut, landSide, hold, setWon, matchWon`.
  Funciones: `VB.Sim.skipHold(g)` → bool (en `'point'`/`'over'`, tras ≥ 0,8 s de pausa, recorta `g.timer` a 0,3 s como mucho; nunca en `'serve'`/`'rally'` ni con el
  partido terminado), `VB.Sim.highlightOf(o)` (fórmula pura del `highlight`, notes/sim.md §P1); constantes `VB.HOLD` (`{routine 1.9, big 2.4, bigAt 0.55, set 4.0, match 4.2, eight 1.4, skipAfter 0.8, skipTo 0.3}`).
  Con `present` las pausas son 1,9 s (normal) / 2,4 s (`highlight ≥ 0,55`) / 4,0 s (set, con el cambio de campo; antes 3,4, cambiado por CAM-09) / 4,2 s en `'over'` antes de `gameOver`; sin él, como antes
  (1,9 / 3,6 / 2,2). `setupServe` coloca el balón en la mano del sacador ya en el paso del `serveReady`.
- **Pulido ola 2 (SIM-04, ritual del sacador CPU)**: estado nuevo `seed` (int), `serveNo` (saques puestos), `cpuTossIn` (s de juego hasta el lanzamiento
  programado de la CPU; decrece de forma monótona desde el `serveReady`, 0 en el paso del `toss` y hasta que acaba el saque; -1 con sacador humano y fuera
  de `'serve'`; `g.timer` vale lo mismo en el saque de la CPU), `ritual` (objeto persistente, solo lectura: `{on, phase:'none'|'wait'|'pre'|'dribble'|'juggle'|'post'|'done',
  t (s desde el silbato), dur (0,8-1,6), bounces (1-3), n, u (0..1 del bote en curso), player, rx, ry, cyc, td, tu, v0, vu, vc, vi, pre, post, still, press}`).
  `serveClock` corre también para la CPU tras el silbato (lanza siempre con ≥ 6,3 s; UI y audio solo lo muestran al humano). Durante el ritual `ball.held`
  sigue siendo el sacador, pero en `'dribble'` el balón bota delante de él con velocidad real: una regla que mire `b.z`/`b.vz` en `'serve'` debe usar
  `g.ritual.on` o la mano. En la PLAYA (`g.beach`, 12-nov-2026) no hay bote: la fase central es `'juggle'` (toquecitos hacia arriba con la mano
  delante del pecho, `VB.RITUAL_BEACH`), con los MISMOS tiempos (silbato → lanzamiento idéntico, sin g.rng) y eventos `juggle` en vez de `dribble`.
  `VB.Sim._holdPos(g, p, out)` = punto de la MANO izquierda (con el balón salvo en los botes). `VB.Sim.ritualAt(g, t, out?)` →
  balón del ritual en el instante `t` sin tocar nada (o null). `VB.RITUAL` (constantes; `tossBy` 4,5 s; demo del menú: `demoBounces` 1, `demoMax` 0,8 s, `demoWhistle` 0,2 s = silbato de la demo, `demoHold` 1,65 s = pausa rutinaria de la demo; solo con `g.demo`: partido humano y autopilot no cambian). `createGame({ritual:false})` = flujo anterior
  byte a byte (pruebas). El estilo (botes, tempo) sale de un hash de `seed` + `player.id`: no gasta `g.rng`, pero desplaza los resultados de cada semilla.
  Lanzamiento de la CPU 1,5-2,3 s tras `serveReady` en partido (demo 1,2-1,5). `VB.HOLD.set` = 4,0 s (antes 3,4: órbita del cierre + grúa, CAM-09).
- **Pulido ola 3 (SIM-05, highlight calibrado)**: `point` añade `clutch` (bool: final apretado — con el marcador de ANTES del punto, el que va delante está en los últimos 8 puntos del
  set, ≥ 17 de 25 o ≥ 7 de 15, y la diferencia es de 2 o menos); `g.lastPoint` también lo copia. `highlight` usa los pesos de `VB.HL` (solo lectura; notes/sim.md §P3:
  tope conjunto peloteo + defensas 0,4, bloqueo directo +0,4, ace +0,25, remate perfecto humano +0,1, punto de set +0,15 o final apretado +0,28 (el mayor), punto de partido +0,45).
  Función nueva: `VB.Sim.clutchOf(s0, s1, target)`. Umbrales para los demás: `VB.HOLD.bigAt` (0,55, «punto grande»: cinta grande, pausa larga) y 0,8 («enorme»: casi solo en
  punto de set/partido). CPU vs CPU: ~20 % de los puntos ≥ 0,55 y < 5 % ≥ 0,8 fuera de punto de set/partido (simtest lo comprueba en 20 partidos completos).
- **Constantes nuevas en `VB.C`**: `IN_TOL` (0,21 m = `C.BR` desde el 12-nov-2026: dentro si cualquier parte de la huella del balón dibujado toca la línea, FIVB 8.3; úsese también para pintar dentro/fuera), `WINDUP` (0,07 s de armado del brazo),
  `ASSIST` (0,16 s), `SWING` (0,30 s), `HOLD_Z/HOLD_FWD/HOLD_SIDE` (balón en la mano izquierda del sacador antes del lanzamiento).
- **Funciones añadidas**: `hitWindow(g, p?, out?)` → `{t (s hasta el contacto ideal; <0 ya pasó), press (s hasta el momento ideal de PULSAR = t − WINDUP), d, dz, reach, kind, zc, x,y,z, active, canReach, attack, jumpT}`
  (reutiliza un objeto interno si no se pasa `out`), `aimPoint(g, out?, move?)` → `{x,y,kind:'serve'|'spike'|'tip'|'free', mode:1|2, aimed, spread, spreadPoor}`
  o null (destino previsto del golpe del humano sin el error de ejecución; `move` = `ctx.simMove`; lo usa fx.js para la retícula), `predictKind(g,p)`, `canDive(g,p)`, `timingQ(te)`, `gradeOf(q)`, `normDiff(d)`; `VB.DIFF`;
  `VB.AI.serveTarget(g, sv)`, `VB.AI.openSpot(g, p, minDepth, out, atk)`; `VB.DIFF_ORDER`, `VB.TIMING`; internos de test `_inBlockVol`, `_serveRisk`, `_recvFail`, `_refreshPred`.
- **Sprint Carrera (9-nov-2026; detalle en notes/sim.md «Sprint Carrera»)**:
  - `opts.badges = [[b7, b11], [b3, b9]]` (misma forma que `attrs`), `b = {idInsignia: nivel 1-3}` o null → `p.badges = {id: nivel}` (o null). Sin `badges` la sim es idéntica
    (no gasta azar). `VB.Sim.BADGE_IDS` = `['canon','mira','rompemanos','seda','bombardero','flotador','muro','ancla','red','motor','sangrefria','lider']`; tablas por nivel en
    `VB.BADGE` (solo lectura); `VB.Sim.badgeLevel(p, id)`, `VB.Sim.aiReact(g, p, pr)`, `VB.Sim.aiTiming(g, p, pr)`, `VB.Sim.reachOf(g, p)`. Valen para humano e IA.
  - **Saque dirigible**: `g.aim3 = {on, x, y, kind:'spike'|'serve'}`. Con sacador humano `on = true`, `kind 'serve'` desde el `serveReady` (en `'ready'` el stick mueve al
    sacador y la diana queda quieta; durante el lanzamiento el stick la mueve a 12 m/s por el campo rival, |x| 1-9, |y| ≤ 4,5; empieza en (−7, 0)). `doServe` apunta a la diana
    con `VB.Sim.serveSpread(q, jump)` de dispersión (perfecto ≈ exacto; el flotante sigue bailando, conserva un 25 % del desvío). `aimPoint` en saque → `kind 'serve'`,
    `spread`, `spreadPoor`, `spreadNow` (null antes del silbato). `hit.target` del saque = la diana. `attrK().srvSpread`. La CPU no cambia.
  - `g.atkSet` (colocador del último ataque).
  - `opts.ref = {p1, p2, p3, d1?, d2?, d3?, chal}` (Carrera: error arbitral y challenge por competición, `VB.Career.matchSetup().ref`): sustituye a `VB.REF_ERR` en ese partido
    (`g.refErr`) y `chal` = challenges por set (`g.chalPerSet`; 0 = sin challenge, la UI oculta el contador). Sin `ref`, idéntico (`VB.Sim.refErrP(dist, g?)`).
  - `opts.nums = [[n1, n2], [n3, n9]]` (cada hueco o equipo puede ser null): dorsal propio (`p.num`); players.js y ui.js ya leen `p.num`.
  - **N jugadores (sprint 1 del 6v6, 10-nov-2026)**: `opts.format = '2v2' | '6v6'` (por defecto '2v2', idéntico byte a byte; '6v6' solo con
    `?format=6v6`; reglas, líbero e IA propia desde el sprint 2, ver §4.3). Estado: `g.format`, `g.size` (2 | 6), `g.rot[t][z-1]` (jugador en la zona z; `rot[t][0]` saca) y
    `g.lineup` (rotación de inicio de set), ambos `null` en 2v2. Jugador: `role` ('S'|'OH'|'MB'|'OPP'|'L', '' en 2v2), `zone` (1-6), `front`;
    `id = team·2 + idx` en 2v2 y `team·16 + idx` en 6v6 (claves dispersas: nadie debe suponer ids contiguos). Ningún módulo debe suponer 4
    jugadores: bucles con `g.players.length` / `g.teams[t].length`; «el compañero» = `VB.Sim.other(g, p)` (2v2: el otro; con más, el más
    cercano). Helpers puros (sin azar, sin asignar por frame): `mates(g, p)` (array cacheado, no modificar), `nearestMate(g, p, x?, y?)`,
    `mateBadge(g, p, id)`, `zoneOf(g, p)`, `zonePos(t, z, out?)`, `isFront(g, p)`, `ZONE`, `rotate(g, t)`, `serverOf(g, t)`,
    `refreshTeams(g)` (tras cambiar quién está en pista). Ganchos: si existe `VB.AI6`, `AI.computeJob` y `AI.pos` le delegan con `g.size !== 2`.
    Huella del 2v2: `tools/fingerprint6.js` + `tools/fp-2v2.json` (simtest la exige).
- **Vóley playa (10-nov-2026)**: `opts.venue = 'beach'` (solo 2v2; main.js lo pasa con `VB.Arena.venue()`, también a la demo del menú y a
  las escenas de depuración) → `g.beach = true`, `g.venue = 'beach'`. Sin `venue` (o `'hall'`), el pabellón byte a byte (huella idéntica).
  Pista POR PARTIDA: `g.HL` / `g.HW` (9 / 4,5 en el pabellón; **8 / 4** en la playa, `VB.C.BEACH`) y `g.cs` (escala respecto a 18×9: 1 / 8⁄9).
  `VB.Sim.court(g | 'beach' | 'hall')` → `{HL, HW, cs, beach}` (cacheado, no modificar): quien pinte o encuadre la pista debe usarlo, no
  `C.HL/C.HW`. `lineDist(x, y, g)` (sin g, la de 18×9). Reglas de playa (`VB.BEACH`, solo lectura): sets a 21 y el 3r a 15 (`g.points = 21`
  aunque se pida otro), cambio de campo cada 7 puntos jugados (cada 5 en el 3r; sin el de los 8), el toque de bloqueo cuenta como toque
  (`g.touches = 1` tras él; el bloqueador puede dar el siguiente), la dejada se juega de nudillos («pokey»: más tensa; `hit.pokey = true`,
  `shot` sigue `'tip'`; textos «Pokey fuera»), y una colocación de dedos «poor» puede ser **dobles** (`point reason 'double'`, texto
  «Dobles en la colocación de dedos»; humano: según el timing, también en salto, `VB.Sim.dblSetP(te, grade, jset)` y
  `VB.BEACH.dblA0/dblA1/dblP0/dblP1/dblJump/dblMax`, azar por `hash01`, no `g.rng`). Sin rotación (el saque alterna en el equipo como en 2v2). `newMatch.venue`. Evento `courtChange`
  con `why: 'swap'` (+ `every` 7|5, `pause` = `VB.BEACH.swapHold`). Cambiar el escenario en mitad de un partido espera al siguiente (main.js).
- **Saque**: `serveReady` → silbato a los 0,7 s (antes no se puede lanzar) → GOLPEAR lanza flotante / SALTAR lanza en salto (`toss`)
  → GOLPEAR en el momento justo golpea (`hit kind:'serve'`). Si el balón cae sin golpearlo o pasan 8 s → falta de saque (`point reason:'serve'`).
- Solo sim escribe en `game`. Los demás módulos lo leen y NUNCA lo modifican.

**Sprint 5 · Maestría (E1; detalle en notes/sim.md «E1 (sprint 5)»).** Todo detrás de `createGame({mastery:true})` →
`g.mastery = !!opts.mastery && !demo && !autopilot && !rot` (2v2 humano). El azar nuevo sale de `VB.Sim.hk(g, salt)` (hash de semilla,
set, marcador y toques), nunca de `g.rng`: la huella 2v2 no cambia. Opciones `opts.mastery`, `opts.aimSet` (colocación dirigida; false =
neutra). Mecánicas: **finta** (GOLPEAR y, ≥ 0,06 s después y antes del contacto, SALTAR o COLOCAR → dejada o colocado; con el bloqueador
CPU en el aire la defensa puede quedar «batida», `DIFF.feintBeat`), **golpe colocado** (COLOCAR en el 3r toque: `kind 'spike'`,
`shot 'roll'`), **al filo** (apuntar hasta 0,05 m de la línea: `VB.Sim.edgeOf`, más dispersión y más manos fuera), **colocación
dirigida 2v2** (stick ↑ rápida, ←/→ carril, ↓ alta; zona muerta 0,6) y **jugada perfecta** (`g.chain`/`g.chainH`: remate perfecto con
cadena 3 y ≥ 2 toques humanos). Estado: `g.mastery, g.aimSet, g.atkMove ('' \| 'feint' \| 'roll' \| 'edge' \| 'quick'), g.atkEdge,
g.lastTempo, g.feintT, g.chain, g.chainH, g.stats.mastery {feint, roll, edge, quick: [usos, puntos], tool, lane, high, cpu:{roll, lane}}`.
Funciones: `VB.Sim.altReady(g)` → '' \| 'jset' \| 'roll' (qué hace COLOCAR ahora), `VB.Sim.setPreview(g, out)` → null \| `{x, y, tempo}`,
`VB.Sim.setWin(g)` / `VB.Sim.setTurn(g)` (C2: ventana de colocación del humano; `setTurn` sin la opción `aimSet`, la que usa COLOCAR en el suelo),
`VB.Sim.edgeOf`, `VB.Sim.hk`; `VB.MASTERY` (constantes); `aimPoint` añade `out.edge` y `kind 'roll'`. `VB.DIFF[k]` añade `feintRead,
tipRead, roll, zoneSet, feintBeat`. Sin acciones de entrada nuevas. Si un lote cambia a propósito la maestría, regenerar
`tools/fp-mastery.json` con `node tools/fingerprint6.js --variant mastery --write` y decirlo.

**Sprint 5 · Entrenamiento (E6; detalle en notes/sim.md «E6 (sprint 5)»).** `createGame({drill})` con 'serve' \| 'recv' \| 'set' \| 'atk' \|
'block' \| 'free' (id desconocido o demo → sin ejercicio; `format '6v6'` + drill → 2v2). `g.drill` está SIEMPRE en el partido: `null` fuera del
modo, si no `{kind, n (0-based), of, total, pts, last, target {x,y,r,r2} | null (mundo, ya × g.cs), idle[2], cpu, mateIdle, best, done,
srvJump, reps[], jumped}`. Con `g.drill` (salvo 'free') control 'one' en el n.º 1, sin `present`, sin `rookie` ni reloj de 8 s; ningún
ejercicio tiene error arbitral ni challenges. `VB.DRILL {hold, order, text, kinds{…medals}}` (solo lectura; `medals` = umbrales de
bronce/plata/oro que usa `VB.Gym.medalsOf`), `VB.Sim.drillStage(g)`, `VB.Sim.drillScore(kind, ctx)` (pura → `{pts 0..3, res, text, d}`),
`VB.AI.leaving(g, team)` (la IA ha decidido dejar botar el saque: lectura pura de `g._lv`).

**Sprint 2-4 (sim, 15-nov-2026; notes/s234/T1.md).** Solo añadidos, sin azar nuevo ni eventos nuevos (huellas idénticas):
- `g.rng.get()` → uint32 / `g.rng.set(v)`: estado del generador sin gastar azar (misma secuencia de siempre).
- `VB.Sim.copyGame(dst, src)` → dst: copia profunda y estructural de `src` sobre una partida `dst` creada con las mismas opts (las sombras de
  `VB.Replay`). Jugadores emparejados por `p.id` (toda referencia a un jugador acaba en los de `dst`, también los campos de banquillo y
  cambios de carrera-pista); sin tabla de campos que mantener. Excepciones: `rng` (get/set), `events` (vacío), `stats`, `replay` y `opts`
  (los de `dst`). Coste: 28 µs en 2v2, 108 µs en 6v6 con banquillo; asigna ~2,8 KB por copia en régimen.
- `VB.Sim.stateHash(g)` → uint32: FNV-1a del balón, posiciones, marcador, sets, `setNo`, modo, `rng.get()` y tiempo. Puro.
- `g.replay = false` en `createGame` (las sombras lo ponen a true; la sim no lo lee). Lo que muta `g` fuera de `Sim.step` (`requestSub`,
  `setCtrlRole`, `skipHold`, `challenge`) no se graba: hoy solo actúa en pausas, fuera del tramo que se repite.

**Online, fase 0 (net, 16-nov-2026; detalle en notes/net.md).** Cambios en `js/sim.js` / `js/ai.js` hechos por la fase del online, todos detrás
de `opts.online` (huellas `fp-2v2.json` y `fp-mastery.json` idénticas; pruebas en `tools/mptest.js`):
- `createGame({online: true, humans: [h0, h1], even, venue, points, bestOf: 1|3, timeouts, seed, present, stats})`, `h = {idx, aimSet, attrs, badges}`.
  Hueco s = equipo s (anfitrión = equipo 0). Fuerza 2v2, control 'one' (cada humano lleva a UN jugador), maestría, nivel 'normal',
  `g.prof = [DIFF.mate, DIFF.mate]` y `g.tm = VB.TIMING.online` (= Normal). A 21 y 1 set por defecto (`g.bo1`); `even` = «Igualado».
- `Sim.step(g, dt, [in0, in1])`: cada entrada con los bits `chal`, `tmo`, `skip` (flancos) y `ai` (nivel). Tiempo muerto APAGADO por
  defecto (sin pausas en juego; solo con `timeouts: true`: 30 s, 1 por set y equipo, en balón muerto cuando ya no queda ventana de
  challenge, nunca entre sets); pausa de 10 s entre sets; «Continuar» (`skip`) solo salta una pausa cuando lo han pulsado los dos.
- Estado: `g.online`, `g.hum[s]` (gesto de cada humano), `g.hT` (hueco activo: sus campos están en los de siempre de `g`; tras cada paso, el
  0), `g.skipReq`, `g.tmoReq`, `g.tmoLeft`, `g.tmoPer`, `g.tmo`, `g.bo1`. Eventos nuevos: `timeoutReq`, `timeout`, `timeoutEnd`, `timeoutCancel`,
  `skipReq`, `slotAI`; el evento `point` online lleva `text1` (texto visto desde el invitado; `text` es el del anfitrión).
- Funciones: `Sim.useSlot(g, t)` (solo sim/IA: la interfaz lee con `slotGet`), `Sim.slotGet(g, t, k)`, `Sim.humOn(g, t)`, `Sim.humSlot(g, p)`, `Sim.setSlotAI(g, s, on)`, `Sim.jsetHum(g, t)` /
  `Sim.jsetHumSw` (lectura de la IA), `Sim.ONLINE {setPause, tmoDur, tmoMin, tmoPerSet}`, `Sim.serialize(g)` → objeto JSON-able y
  `Sim.deserialize(obj, dst)` → dst idéntica bit a bit (o null si `obj.v !== Sim.SER_V`, hoy 2). `serialize` deja
  antes el hueco 0 activo (foto canónica).

**Online, fase 1 (net, 16-nov-2026; detalle en notes/net.md).** Ficheros nuevos del especialista `net`, sin DOM ni THREE (se prueban en Node):
- `js/net.js` → `VB.Net`: `new Session({slot: 0|1, link, opts (createGame; el invitado puede pasar null y adopta las del anfitrión), delay
  (2 tics), name})`. `session.advance(now ms, entrada) → {g (partida predicha), events (para presentar, sin repetir tras un rollback;
  gameOver solo confirmado), confirmed, status ('connecting'|'starting'|'playing'|'waiting'|'over'|'ended'), tick, gcTick, ping,
  waitMs, unstable, canAI, startIn, solo, valid, result, rivalSolo, gone}`; `request('chal'|'skip'|'tmo')`, `setAway(bool)` (bit `ai`),
  `vsAI()` (el rival puede volver hasta 60 s después de perderse), `quit()` (tras el final no cambia el resultado),
  `confirmedGame()` (lo que deja huella sale de AHÍ), `predictedGame()`, `initEvents`, `rivalName` (nombre, nunca correo ni IP).
  Fase 6: `stepInputs()` = las dos entradas del último paso confirmado (`[hueco 0, hueco 1]`, decodificadas, objeto reutilizado); solo
  vale dentro de `onTick(tic, gc)` (opción de la sesión, tras cada `Sim.step` de gc que no sea la resimulación de una reparación).
  Entrada = `{move (mundo canónico), hit, jump, jset, chal, skip, tmo, ai}`, cuantizada (int16 + 1 byte) antes de usarla en local.
  Transportes `{send(ch, data), poll(now), close()}` (`'in'` no fiable, `'ctl'` fiable y en orden): `memPair({lag (RTT), jit, loss, seed,
  clock})` y `BcLink({room, slot, lag, jit, loss})` (BroadcastChannel). `bot(team, seed)`: bot de solo entrada para pruebas.
- `js/netview.js` → `VB.NetView`: `mirror(view, g, slot)` (copyGame y, para el invitado, `flip`: giro de 180°, parejas por equipo
  intercambiadas, equipos 0 ↔ 1 y su hueco como activo: `view.ctrl` = su jugador), `mapEvents(evs, view, slot, out)` (copias remapeadas;
  el punto con `text1`), `inputToWorld(inp, slot)`. Clasificación cerrada `FIELDS` / `PLAYER` / `NESTED` / `EVENT`: un campo nuevo en `g`,
  en un jugador o en un evento hace fallar `tools/viewtest.js` hasta que se clasifica allí (girar, intercambiar, equipo o tal cual).
- `js/main.js` (rama online, hecha por net): `ctx.actions.startOnline({slot, link, opts, name})`, `ctx.net` (sesión y vista), `ctx.netBot`
  (depuración), `ctx.actions.netVsAI()` / `netQuit()`. Con `ctx.net` el frame no usa `acc`/`MAX_STEPS`/`timeScale`, ni pausa (Esc enseña
  «Abandonar»), ni intro ni repetición; `ctx.game` es la vista. HUD propio `#netHud` (rival, ping, esperas) y `#netTag` (nombre del rival
  con flechita encima de su jugador). Prueba: `?net=bc&slot=0|1&lag=&jit=&loss=` (implica `ctx.debug = 'net'`: sin récord ni XP).

**Online, fase 2 (net, 16-nov-2026; detalle en notes/net.md «Fase 2»).** Transporte real y lobby. Ficheros nuevos de `net` (entran en
`js/net*.js`) y prueba nueva `tools/roomtest.js` (también de **net**):
- `js/netroom.js` → `VB.NetRoom.create({base, auth, ver})`: salas y señalización en Firestore por REST (sin DOM; Node y navegador).
  `list()`, `open(cfg)`, `beat(patch)`, `get(id)`, `byCode(code)`, `join(id, nombre)`, `leave(id)`, `close()`, `putSig/getSig/delSig`,
  `sweep()`, `bye(role, id)` (al cerrar la pestaña, keepalive); la oferta lleva `to` (uid del invitado) y la respuesta `uid` (quien la
  escribe), y cada una solo la lee su destinatario y el anfitrión; errores con `.code` `'off'` (reglas sin desplegar), `'denied'`, `'auth'`, `'net'`, `'full'`, `'gone'`, `'version'`.
  Además `cleanName` (nombre visible de 2-16 unidades UTF-16 como las reglas, nunca con @), `newCode/codeOk/normCode` (6 de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`).
- `js/netrtc.js` → `VB.NetRtc.Link`: enlace WebRTC (`'in'` no fiable id 1, `'ctl'` fiable id 2, negociados), mismo contrato que
  memPair/BcLink más `offer()/answer(sdp)/accept(sdp)`, `state`, `onstate`, `onclose`, `info()` (solo el TIPO de par, nunca la IP).
- `js/netlobby.js` → `VB.NetLobby`: la página Online (`open(host)`, `leave()`, `back()`, `side(el, d)`, `focus()`, `menuOn()`), la
  conexión (señalización, «pre» con nombre y atributos del invitado, `ctx.actions.startOnline`) y la renegociación si la conexión se cae
  en pleno partido; en `pagehide` suelta la sala o el hueco. Guardados por aparato (nunca a `DOCS`): `voley3d.nick` (tu nombre en el online) y `voley3d.netroom` (última
  configuración de sala). `MENU_ON` (`true` desde la fase 4: la tarjeta Online de Jugar sale para todo el mundo; con `false` solo con `?online=1`).
- Toques en ficheros de **ui_main** hechos por esta fase (pedidos por el orquestador; mínimos): `index.html` (scripts nuevos, tarjeta
  `#btnOnline` oculta en Jugar, página `#mpOnline` con `.ol-body`), `js/ui.js` (página `'online'` en `pageEl/pageFocus/setPage/menuGo`,
  `menuBack` pregunta antes a `NetLobby.back()`, ←/→ con `NetLobby.side`, y **sin récord, XP, perfil, insignias, retos ni Vestuario en
  un partido online**: `online = ctx.game.online || ctx.net` en `showEnd` y en el `gameOver` de los retos), `js/account.js`
  (`VB.Account.netAuth()` → `{uid, token}`, `netInfo()` → `{uid, kind, user}` sin correo, `FS_BASE`) y `firebase/firestore.rules`
  (bloque ONLINE: `rooms/{uid}` y `rooms/{uid}/sig/{offer|answer}`, **desplegado el 16-nov-2026**; comprobado en la revisión de la fase 3:
  lo publicado es igual que el fichero del árbol, sin contar comentarios).

**Online, fase 3 (net, 16-nov-2026; detalle en notes/net.md «Fase 3»).** Partido completo. Fichero nuevo de `net`: `js/netrec.js`
(`VB.NetRec`, sin DOM; `index.html` lo carga tras `js/look.js`) y prueba nueva `tools/net3test.js`; `tools/netdrive.js --guion`.
- `js/net.js`: `new Session({…, epoch})` (revancha n.º k sobre el MISMO enlace: el byte 0 del paquete de entradas es `1 | época << 4` y
  los mensajes de control llevan `ep`; lo de otra época se ignora; época 0 = el formato de antes), `sendApp(obj)` → llega en `r.app` del
  otro lado (revancha), `r.rivalLeft` (el rival se fue tras el final: no hay revancha), `session.maxCatch` (tics por llamada; pestaña oculta).
  Revisión: `Session({rivalName})` (manda sobre el saludo; `VB.Net.cleanName`), `CONNECT_MS` (20 s sin el rival antes de empezar →
  `result {why:'noShow'}`; también su adiós de la época anterior), `quit()` antes de empezar → `{why:'cancel'}`, `r.goneIn` (ms que le
  quedan al rival para volver) y los pongs de antes de un corte no cuentan en el ping.
- `js/netrec.js` → `VB.NetRec`: récord online aparte en `voley3d.online` (`{played, wins, losses, quits, nc, streak, best, last[10]}`;
  abandonar o tardar más de 60 s en volver = derrota; caída del anfitrión, otra versión o partido no válido = «no cuenta»), marca
  `voley3d.online.pend` (lista, una marca por página; cerrar la pestaña en pleno partido = abandono al barrer: al cargar o al empezar,
  latir o acabar otro partido, cuando la marca lleva 90 s sin latido),
  `begin/beat/end/boot/get/line/outcome`. `end` concede la gorra `gorraMTC` (`VB.Look.grant(id, 'online')`) si terminaste el partido.
- `js/look.js` (ui_main; toque de esta fase): objeto `gorraMTC` «Online Beta Tester» (cabeza, pista y playa, rareza 2, desbloqueo
  `{online: 1}` → «Online: termina tu primer partido»; `checkGlobal` nunca lo concede), origen `'online'` en `SRCS` y en `HIDE_HAIR`.
  `tools/looktest.js` actualizado (clave `online`, id en la especificación de cabeza, 6 objetos nuevos desde 928ac39).
- `js/doll.js` (players; toque): `gorraMTC` en `ITEMS.head` y `HIDE_HAIR`; se dibuja como la gorra y una tira de la copa de 13 × 5 caras
  pintadas por vértice con «MTC» (`mtcPanel`, 130 triángulos fijos; letra clara u oscura según cA).
- `js/players.js` (players; toque): `setKit(st)` acepta `st.kit1` (equipación del equipo 1 ya decidida, sin comparar) y `st.looks1`
  (looks del rival, n.º 1 y n.º 2 del equipo 1: `LOOK_OVR[2..3]`, `lookSlot`); fuera del online no vienen y se quitan.
  `VB.Players.onlineKits(a, b)` → `[k0, k1]` con las reglas de setKit (la del equipo 1 si se distingue; si no, la de la CPU más distinta).
- `js/netlobby.js`: el «pre» lleva `look = myLook()` (`{fits: [n.º 1, n.º 2] del Vestuario, kit: equipación de Ajustes}`, saneado al
  mandar y al recibir con `saneLook`: `VB.Look.sane`, 8 KB por fit, colores de 24 bits); `startOnline({…, rivalName, look: {mine, theirs}})`.
  En la lista sale «Tu récord online».
- `js/main.js` (rama online): equipaciones (`onlineKits` con las de los dos; el equipo 0 de la vista es siempre el tuyo) y looks
  (`calcLooks({fits})`), `view.netCr` (nombres; ui.js lo trata como `g.career`), revancha (`ctx.actions.netRematch`; el anfitrión manda
  `{t:'go', e}` y los dos abren una sesión de la época siguiente), «Continuar» (`ctx.actions.netSkip`, botón del HUD en la pausa de
  10 s entre sets), pestaña oculta (`visibilitychange` → `setAway` + un Worker de Blob que avanza la sesión sin pintar), récord y gorra
  (`VB.NetRec`; en `?net=` solo con `&netrec=1`), `VB.NetRec.boot()` al arrancar. Pruebas de `?net=bc`: `&netcap=1`, `&kitshirt=`, `&botprof=flojo`.
- `js/ui.js` (toque): `cpuTxt` y el marcador miran `g.netCr`; `endData.cpu` = nombre del rival; hoja final online con «Revancha»
  (`data-act 'rematch'`, rótulo al día en `onlineEndSync`) y «Volver al menú», y «Tu récord online» al pie del resumen (`onlineEndRec`).

**Online, fase 4 (net, 16-nov-2026; detalle en notes/net.md «Fase 4» y «Para Ferran»).** Publicación. `js/netlobby.js`: `MENU_ON = true`, Revisión: el lobby solo reacciona a la cuenta cuando cambia el uid (`accKey`), no en cada sincronización; vista `nortc` sin «Volver a probar» y `noRtc()` antes de abrir u ocupar sala; `netHud` pinta el nombre del rival desde una marca `\u0001`, nunca con replace().
vista `'help'` («Cómo funciona el online»: sale sola la primera vez que se entra con sesión, guardado por aparato `voley3d.nethelp`; luego
desde la fila «Cómo funciona» bajo «Actualizar»; Esc/B o «Entendido» vuelven a la lista), consejo corto en la sala de espera, en teléfono
apaisado la página toma el ancho de las demás (560) y las filas de sala enseñan sede y partido; una sala sin sede no repite «Playa | Playa».
`index.html` (toque): pastilla «Beta» (`.md-soon`) en la tarjeta `#btnOnline`. `js/main.js` (rama online): el HUD online separa los datos
con « | » (guía de estilo) y baja de línea en pantallas estrechas (`flex-wrap`, ancho máximo de la pantalla). `tools/netdrive.js`: comprueba
«Cómo funciona» en `--rtc`; `NDW`/`NDH`/`NDTOUCH=1` en el modo básico (teléfono apaisado con un corte: el aviso de espera cabe). Sin reglas
nuevas: el bloque ONLINE de `firebase/firestore.rules` ya está desplegado.

### 4.3 Eventos (cada frame main.js pasa el mismo array `events` a todos los módulos)
Todos llevan `type` y `t` (tiempo de juego). `player` es la referencia al objeto jugador de `game.players`.
| type | payload | cuándo |
|---|---|---|
| `newMatch` | `{demo, difficulty}` | partido creado |
| `serveReady` | `{team, player, setPoint, matchPoint}` | sacador con el balón |
| `whistle` | `{reason:'serve'|'point'}` | autorización del saque / fin de jugada (el 1r árbitro de arena señala con el brazo) |
| `hit` | `{kind:'serve'|'pass'|'set'|'spike'|'free', player, team, touch (0 saque,1..3), quality 0..1, x,y,z, speed, human, grade:'perfect'|'good'|'poor', timing (s, <0 pronto), power 0..1, shot, dive (bool), aim [x,y]|null, target [x,y]|null, jset (bool)}` | toque válido. `shot`: saque `'float'|'jump'`; recepción `'forearm'|'dig'|'shank'|'dive'`; colocación `'overhead'`, **colocación en salto `'jump'` (`kind 'set'`, `jset: true`, también con `touch 1`)**; ataque `'power'|'tip'`; 3er toque desde el suelo `'overhead'|'forearm'`. **La dejada es `kind:'free', shot:'tip'`**. `shot:'body'` = el balón da en el cuerpo sin gesto (`grade:'poor'`, `kind` según el toque) |
| `swing` | `{player, shot:''|'tip'}` | el humano pulsa golpear (gesto aunque no llegue) |
| `toss` | `{player, team, jump, human}` | el sacador lanza el balón (flotante / en salto) |
| `miss` | `{player, reason:'early'|'late'|'far', t2}` | gesto humano sin contacto con el balón cerca (UI: ¡Pronto! / ¡Tarde! / No llegas) |
| `dive` | `{player, x,y,z, dir:[dx,dy], miss?}` | plancha. `miss:true` = plancha de la IA que no llega (sin `hit` después) |
| `netTouch` | `{player, x,y,z}` | un jugador toca la red (justo antes del `point` con `reason:'net'`) |
| `jump` | `{player}` | despega |
| `landPlayer` | `{player}` | aterriza |
| `block` | `{player, team, x,y,z, result:'stuff'|'soft'|'tool'|'touch', quality, human}` | bloqueo efectivo (no cuenta como toque). `stuff` = al campo del atacante, `soft` = toque jugable, `tool` = block-out, `touch` = roce que sigue a su campo frenado |
| `net` | `{x,y,z, tape}` | el balón toca la red (`tape`: en la cinta) |
| `land` | `{x,y, inside, team (campo donde cae), speed}` | primer bote en rally |
| `bounce` | `{x,y,speed}` | botes de balón muerto |
| `point` | `{team, reason:'in'|'out'|'antenna'|'double'|'four'|'net'|'serve'|'under'|'block'|'attackServe', text, score, sideout, rallyTime, rallyHits, setWon, matchWon, how:'ace'|'kill'|'tip'|'block'|'free'|'error', player (falta personal o null), lastKind, lastShot, antenna ([x,y,z] del contacto con la antena \| null = cruzó por fuera; solo con reason 'antenna'), highlight (0..1: lo grande que ha sido el punto; ≥ 0,55 «grande», ≥ 0,8 «clímax»), digs (int: defensas de remate del peloteo), streak (int ≥ 1: puntos seguidos del que puntúa en el set), savedSetPoint (bool: tenía en contra punto de set/partido), signal ('in'\|'out'\|'touched'\|'four'\|'double'\|'net'\|'under'\|'antenna'\|'attackFault'\|'delay8'\|'serveFault': señal oficial del árbitro), touchedOut (bool ⇔ signal 'touched'), landSide (0 = x > 0, 1 = x < 0, -1 sin bote), hold (s de juego hasta el siguiente saque o `gameOver`), clutch (bool: final apretado, SIM-05)}` | punto. `antenna` = toca la antena (aunque no cruce la red, 8.4.3) o cruza en todo o en parte por fuera del espacio de paso (8.4.4). `text` es la frase del árbitro (lista cerrada en simtest `POINT_TEXTS`; 'out' según el último toque: "Saque fuera", "Remate fuera", "Recepción fuera", "Defensa fuera"…; balón que toca la red y cae en el propio campo: "Saque a la red"/"Balón a la red" con `reason 'in'` (dentro) o `'out'` (fuera)). `attackServe` llega unos instantes DESPUÉS del `hit` (al cruzar el balón la red), no en el mismo paso. `net` = toque de red, `serve` = falta de saque (8 s / no golpea el lanzamiento), `under` = por debajo de la red, `block` = bloqueo del saque, `attackServe` = ataque del saque rival por encima de la red en zona de ataque (13.3.4) |
| `sideout` | `{team}` | cambio de saque (rota el sacador) |
| `set` | `{team, setNo, score, sets}` | set ganado |
| `match` | `{team, sets, setScores}` | partido ganado (al caer el balón) |
| `gameOver` | `{team, sets, setScores}` | fin de partido humano tras la pausa (UI muestra pantalla final) |
| `newSet` | `{setNo}` | empieza el set siguiente |
| `switch` | `{from, to, auto, reset?, reason?}` | cambia el jugador controlado (auto = lo decide el juego; `reason:'defense'` = al colocar la CPU, ~1,5 s antes del remate) |
| `dribble` | `{player, team, x, y, n (1..of), of (botes de este ritual), speed (m/s contra el suelo), last (bool)}` | cada bote del ritual del sacador CPU (SIM-04); en ese paso `ball.z === BR`. Audio: bote controlado. Solo en el pabellón |
| `juggle` | `{player, team, x, y, z, n (1..of), of, last (bool)}` | playa: cada recogida de un toquecito del ritual del sacador CPU (en vez del bote; el balón no baja del pecho). Audio: palmada suave |
| `courtChange` | `{setNo, why:'set'|'eight'|'swap', score, sets, pause, every?}` | cambio de campo (18.2.1 / 18.2.2): al acabar un set que no cierra el partido y a los 8 del 3r set; en la playa (`'swap'`), cada `every` puntos jugados (7; 5 en el 3r). Solo presentación (el humano sigue en x > 0) |
| `fx:highfive` / `fx:fistbump` / `fx:chestbump` / `fx:clap` | `{team, x, y, z (sim), strength 0..1}` | NO los emite sim: main.js vacía `VB.Players.drainFx()` justo después de `Players.update` y los añade al array del frame (contactos cosméticos de la celebración; FX, cámara, audio y UI los ven). Audio: `highfive` → choque, `fistbump` → puños, `chestbump` → pecho (PLY-15, victoria del partido, strength 1), `clap` → palmada de ánimo; `fx:catch` (players, cada recogida del bote en el ritual del sacador CPU, strength 0,6) → recogida blanda; `fx:call` (players, PLY-20: «¡mía!» del que va a por el balón, un evento por balón, `z` = cabeza, strength 0,6; audio lo ignora por ahora) |

**Añadidos del sprint Carrera a los eventos**: `hit.dig` (bool, defensa controlada de un remate rival), `hit.recv` (bool, 1r toque tras un saque);
`point.assist` (jugador de la colocación del remate que gana el punto, solo con `how 'kill'`, o null) y `point.tool` (bool, remate que toca el bloqueo rival y sale fuera);
`g.lastPoint` copia los dos. Los cuenta `VB.Badges.ingest` (insignias) y `VB.Career.ingest` (nota del partido).

**6v6 (sprint 2, solo con `createGame({format:'6v6'})`; el 2v2 no cambia y no emite nada de esto)**:
- Estado: `g.roster[t]` = los 7 del equipo (6 de la rotación + líbero); `g.libero[t]` (rol `'L'`, dorsal 13/14, id `team·16 + 6`);
  `g.liberoFor[t]` = central al que sustituye ahora (o null); `g.setPlan[t]` = decisión del colocador `{to, tempo:'high'|'shoot'|'quick', d, yl, apex, t, sys}`
  (válida mientras `t === g.lastTouchT`); `g.overlap = [n0, n1]` (pares solapados en el último saque; la IA siempre 0).
  Jugador 6v6: `p.bench` (true = en el banquillo, NO está en `g.players`), `p.fx/fy` (sitio de su formación de recepción), `p.toX`.
- **`g.players` y `g.teams[t]` = solo los que están en pista** (12). El líbero ocupa el hueco (índice) del central que sale. Quien
  dibuje a los atletas (players.js) debe crear rigs para **`g.roster`** (14) y ocultar/teletransportar a los `p.bench` al recibir `libero`.
- Eventos nuevos: `rotation` `{team, rot: [dorsales de zona 1..6], server}` (justo después de `sideout`, el equipo ha rotado);
  `libero` `{team, inP, outP}` (al preparar el saque, en `setupServe`, antes de `serveReady`: entra o sale el líbero; sin contar como cambio).
- Motivos nuevos de `point` (solo 6v6): `'backAttack'` («Ataque de zaguero» / «Ataque del líbero», como `attackServe`: se pita al cruzar la red
  o tocarlo el rival) y `'backBlock'` («Bloqueo de zaguero» / «Bloqueo del líbero»); `signal 'attackFault'`. La IA no los comete nunca.
- `VB.Sim`: `applyLibero(g)`, `overlapCount(g, t)`, `onCourt(g, t, zona)`, `ROLES6`; `VB.SIX` (afinado del 6v6). `VB.AI6` (js/ai6.js, cargado
  tras ai.js): `computeJob, pos, placeServe, passTarget, chooseSet, blockPlan, digK, canAttack, setterOf, FORM`.
- Revisión del sprint 2 (10-nov-2026, solo 6v6, detrás de `g.rot`): el defensor «perdido» (dado `g.digOk` en contra) lee 0,4 s tarde y va
  al 30 % (`BEAT6` en ai.js; en 2v2 0,12 s y 60 %, como siempre); el central zaguero cubre la colocación en el sitio del líbero.
  Pendiente (sprint 3): humano en 6v6 (control Uno por rol, «¡Pídela!», `AI6.decide`), sin eventos `switch` en 6v6, faltas de posición pitadas.
- **6v6 con humano (sprint 3, 11-nov-2026; solo con `g.rot`, el 2v2 no cambia: huella idéntica)**: `g.ctrl` = el primer jugador del puesto
  `g.ctrlRole` ('OH': el receptor n.º 2, siempre en pista), control fijo sin eventos `switch`. Estado nuevo: `g.ctrlRole`, `g.assist6` (Fácil/Normal:
  posición asistida también al balón propio), `g.ask6` (g.time del último «¡Pídela!»: `input.switchPlayer` en el peloteo con control 'one' en 6v6).
  Posición asistida (sim `assist6`): sin stick el humano va a `VB.AI6.pos`. `VB.AI6`: el humano es un candidato más en `computeJob` (área de
  responsabilidad del 1r toque y «¡mía!» si pulsa GOLPEAR cerca del punto de toque) y en `chooseSet` (×1,3; ×2,5 más con «¡Pídela!» en los
  últimos 3 s); `VB.AI6.HUM` (constantes). La colocación en salto del humano en 6v6 (2º toque) va al carril que elige `chooseSet` (deja
  `g.setPlan`). `updateDefense` en 6v6: `g.defRole` = 'block' si el humano está en el `blockPlan`, si no 'dig'.
  main.js: `?format=6v6` = espectador (como en el sprint 2); `?format=6v6&human=1` o `ctx.settings.format === '6v6'` o
  `startMatch({format:'6v6'})` = humano (`{format:'2v2'}` fuerza el 2v2 sin mirar el ajuste). Escenas `?debug=serve6h|rally6h`. input.js: el
  botón ⇄ se queda en 6v6 («¡Pídela!», con icono de mano). `VB.Sim.askOk(g)`: ¿vale ahora «¡Pídela!»? (peloteo, humano delantero, antes de
  la colocación de su equipo; el colocador humano solo delantero y tras dar él el 1r toque —17-nov-2026—, y entonces el colocador de emergencia
  le acepta como atacante en `chooseSet`, tempo 'shoot', ×`HUM.askS`); `g.ask6` solo se guarda si vale. Evento nuevo `{type:'ask', player, ok}` en cada pulsación de CAMBIAR en
  6v6 (ui.js: sello «¡Aquí!» / «Ahora no»; audio.js). fx.js: en 6v6 el aro amarillo solo sale con el balón del humano. El 6v6 humano no
  cuenta en el récord del Partido rápido.

**Sprint 5 en los eventos.**
- `hit` añade `feint` (bool), `tempo` ('' \| 'quick' \| 'lane' \| 'high', en la colocación), `edge` (0..1) y `chain` (int; 3 = jugada
  perfecta); `shot` puede ser `'roll'` (golpe colocado, `kind 'spike'`). El saque los lleva con valores neutros. `point` y `g.lastPoint`
  añaden `move` ('' \| 'feint' \| 'roll' \| 'edge' \| 'quick').
- Nuevos: `feint {player, team, shot:'tip'|'roll'}` (finta), `drillStage {kind, n, of, target:[x,y,r] | null}` (montaje de cada repetición:
  los jugadores se teletransportan; players lo trata como `serveReady` y la cámara corta con `lastCut.kind 'drill'`), `drillRep {kind, n, of,
  pts, total, res, text, x, y, d, grade, hits, best, isBest}` (`text` = sello en castellano de `VB.DRILL.text`; en 'free' `hits/best/isBest`
  son el peloteo y `pts` 0), `drillEnd {kind, total, reps, best}`.
- **Con `g.drill` NO hay `point`, `whistle` (tampoco el de autorización del saque), `gameOver`, `set`, `match` ni `sideout`**; marcador y
  estadísticas quedan a 0, y entre repeticiones `g.lastPoint.how === 'drill'` (no pintar rótulos de punto con él).
- `fx:floor {team, x, y, z, strength}` (players, por `drainFx`): palmada al suelo de `digHero` (0,6) y puñetazo de la plancha fallida (0,4).
  Audio: golpe sordo en el pabellón, «puf» de arena en la playa.

**Sprint 2-4 (15-nov-2026).** `e.replay = true` en los eventos que emite la repetición (`VB.Replay.tick` rellena dos arrays propios: el de
Players con `point` y el de FX/Audio sin él). **No hay eventos de sim nuevos.** Los eventos con `e.replay` nunca llegan a `UI.ingest`,
`careerEvents`, `Badges`, `Retos`, `Profile` ni `Career`; audio.js no lanza grada ni ráfagas con ellos.

### 4.4 Módulos de presentación (todas las funciones son opcionales; main.js las llama con guarda y try/catch)
Objetos: `VB.Arena`, `VB.FX`, `VB.Players`, `VB.CameraRig`, `VB.Input`, `VB.Audio`, `VB.UI`.
| función | quién la llama / cuándo |
|---|---|
| `init(ctx)` | una vez al arrancar, en el orden Arena, FX, Players, CameraRig, Input, Audio, UI |
| `onGameStart(game)` | al crear un partido (menú demo, partido, escena de depuración). Players reconstruye rigs aquí |
| `onState(state, prev)` | al cambiar `ctx.state` |
| `onSettings(settings, changedKey)` | al cambiar un ajuste |
| `setQuality(q)` | al arrancar y cuando la calidad adaptativa baja |
| `resize(w, h)` | al cambiar el tamaño |
| `update(game, dt, events)` | cada frame. **Arena, Players, FX, UI** reciben `dt` = tiempo de JUEGO (0 en pausa/congelado: deben pintar la pose actual igualmente). **CameraRig** recibe `dt` real |
| `VB.Audio.handle(events, game)` / `VB.Audio.update(game, realDt)` | cada frame |
| `VB.Audio.unlock()` | primer gesto del usuario y al empezar partido |
| `VB.Audio.setMuted(b)`, `isMuted()`, `click()` | ajustes / botones de la UI |
| `VB.Input.poll(realDt)` → `{mx,my,hit,jump,switchPlayer,pause,mute,any,device}` | al principio de cada frame. `isTouchActive()` |
| `VB.CameraRig.getBasis()`, `snap(game)`, `shake(a,dur)`, `slowmo(scale,realSec)` | main.js / ctx |
| `VB.Players.rigOf(player)` | para que cámara/FX sigan partes del cuerpo |
| `VB.FX.burst(x,y,z,n,power)` | partículas (coords de sim) |
| `VB.UI.banner(t1,t2,t3,cls,dur)` | banner central |

**Añadidos opcionales** (detalle en `notes/<owner>.md`): `VB.Players.handWorld(p, right?, out?)`, `VB.Players.rigs` (cada rig: `lodFrac`, `lodBig`, `upT0`, `upDiveT` solo lectura; un atleta > 58 % del alto de pantalla usa la malla alta en media/baja); `VB.Arena.bounds`, `message(text, team, dur)`, `cheer(team, sec)`, `wave(sec)`, `postActive()`;
`courtChangeT()` (s que quedan del momento del cambio de campo; 0 = no hay), `landmarks` (`{scoreHung, screenPos, screenNeg}`, coords de sim);
`VB.FX.confetti(team, n)`, `ballObject()`, `dust(x, y, n, dirx, diry)`; `VB.CameraRig.slowmo(scale, realSec, easeOut?)`, `kick(deg)`, `getShot()` (incluye `'court'`), `getDebug()` (`.pf` = plan del plano del punto, `.ccU` = avance de la grúa del cambio de campo 0..1 o -1, `.mateLo` = NDC y de los hombros del compañero entre cámara y jugador (-9 = no aplica), `.mateUp` = m que sube la cámara en táctil para sacarlo del cuadro), `_setOrbit(a)` (pruebas); `VB.Input.rumble(s, ms)`, `poll()` añade `confirm, hitHeld, jumpHeld, padEvent (''|'connected'|'disconnected', un frame)`, `VB.Input.padInfo()` → `{connected, id, mapping}`, `VB.Input._debug()` (pruebas; `.pad.rest` = reposo aprendido del stick: la zona muerta se mide desde ahí, mando con deriva);
`VB.UI.nav(it, realDt)`, `back()`, `ingest(events, g)`, `callout(text, team)`, `isPanelOpen()`, `tabs(host, items, opts)` (pestañas reutilizables; ver notes/ui_main.md «Menús v2»), `padTabDir()`, `menuPage()` / `menuGo(p)` / `menuBack()` (páginas del menú `'main'` \| `'play'` \| `'quick'`), `padEvent(kind)` (main.js con `it.padEvent`: "Mando desconectado" en la pausa); `VB.Audio.hover()`, `ui(kind)`, `setVolume/getVolume`, `play(name, gain?, x?, y?)`, `sting(name)`, `ready()`, `VARIANTS`, `LOOPS`, `LEVELS` (plan de mezcla en dB, solo lectura), `synthSteps(name, variant, rate)` (pruebas); `stats` añade `deferred`, `lateDrop`, `lateMax` (ms): sonidos críticos sin buffer aún que se aplazan / se descartan por llegar tarde.

**Añadidos opcionales, pulido ola 1**: `VB.Players.drainFx(out)` (ver eventos `fx:*`), `VB.Players.heroShotAware` (true: la convergencia sigue `CameraRig.heroShot()`), `VB.Players._marker()` (pruebas),
rig de solo lectura `aMode/aw0/aw1, hipYaw, fk[].lock, pdW, diveTc, vh` (`offX/offY` incluye la convergencia del punto: hasta 4 m de la sim; `rigOf`/`handWorld` son la verdad visual);
`VB.Arena.prewarmList()` (copias que comparten geometría/material, sin tocar la escena), `VB.Arena.prewarmCompile()` (→ ms; compila contra el destino real del post), `VB.FX.prewarmList()`, `VB.FX._dbg()`,
`VB.Arena._dbg().crowdU` (uniform `uCrowdLight` de la grada);
`VB.CameraRig.heroShot()` → null o `{heroId, mateId, team, camX, camY, hx, hy, heroYaw, conv, mx, my, mateYaw, t}` (solo en `'point'`; objeto reutilizado, no modificar), `hitStop(ms, grade)`, `punch(deg)`, `clinchLeft()`,
`getDebug()` añade `cutN` (sube en cada corte deliberado), `lastCut {from, to, kind:'point'|'serve'|'court'|'over', t}`, `nextCutIn` (s reales al próximo corte; -1 ninguno), `timeScale, hitStop, punch, shake, fb`, `pf.mode/.how/.both/.team/.heroX/.backCut`;
`VB.Input.rumbleSig(name, k)` (firmas perfect/good/poor/body/won/lost/match/kill/block), `ctx.settings.rumble === false` apaga la vibración, sin gesto previo no se llama a `navigator.vibrate`, `_debug().sigs/.dead`;
`VB.Audio.stats.ticks`, `VB.Audio._debug()` (pruebas), sonidos `spikeHero, blockHero, sub, slamSub, tick, slap, fist`;
`VB.UI.bannerRect()` (px CSS o null), `VB.UI.onHoldSkip()` (main.js al recortar la pausa), `VB.UI.bootReady(bootEl)`, `VB.UI._gym()` (pruebas).

**Añadidos opcionales, pulido ola 2**: audio: la síntesis del banco va en un Worker creado desde el propio audio.js (función `VBAudioModule`, Blob, sin ficheros ni red; respaldo: cola troceada con una variante de cada sonido de juego primero); `VB.Audio.stats.worker` (`'none'|'starting'|'on'|'off'|'failed:<motivo>'`), `stats.workerMs`, `stats.workerHi` (ms hasta el saludo), `stats.bumped`, `stats.missed` (nombre → veces pedido sin buffer), `VB.Audio._bank(name)` (pruebas), `window.__vbAudioNoWorker = true` (pruebas: sin Worker).
ui_main: en táctil no hay consejo arriba durante el saque (los dos saques van en el aviso anclado `#prompt.two`, 2×2; `#promptKey` sigue visible para bots y herramientas); cintas grandes del punto como mucho 1 de cada 3 puntos (salvo `highlight ≥ 0,8`, punto de set/partido leído de `serveReady`, o punto de set salvado); durante el plano de héroe con el héroe a la izquierda (`getDebug().pf.heroX < -0,5`) el marcador `#sb` se atenúa.
camera.js: temblor del bote también tras un bloqueo (0,045 / 0,2 s); el plano de héroe lee `#sb`/`#pbug` (una vez por punto), predice el balón y los rivales. players.js: el que anota sigue de cara a la cámara del héroe (`c.hyaw`) hasta que acaba la pausa; colocación con los dos pies plantados (`layerG(P,T,w,plant)`, `SET_PLANT`, `SET_UP = 0,12`).

**Añadidos opcionales, pulido ola 2 (segunda tanda)**:
players: `VB.Players.faceOf(p)` (en `'point'`/`'over'` la orientación objetivo de la celebración; si no, `rig.yaw`); rig de solo lectura `celV`, `celId`,
`apOn`/`apS`/`apWarp` (carrera de ataque), `standW`, `yawV`, `lieW`. Durante ~1 s antes del salto de ataque de la CPU `offX/offY` puede valer hasta ~2,5 m
(carrera visual; 0 en el despegue): usar la posición VISUAL (`rigOf`, `visPos`) para sombras y encuadres. Las excepciones de `Players.onEvent` se registran
una vez como `[VB][ERROR] Players.onEvent`.
arena/fx: `VB.Arena._dbg().mood` (luz de tensión; `mood.force` 0..1 la fuerza en pruebas, -1 = automático), `_dbg().led` (`w` cortina del mensaje, `GLOW`);
mallas `hallShell` (cascarón del pabellón, sin luces) y `contactBlobs` (fx: manchas de contacto de balón + 4 atletas en un `InstancedMesh`; sustituye a la
sombra del balón); el material de los halos es `ShaderMaterial` (`halos.material.uniforms.opacity`); los mensajes LED entran con cortina de 0,38 s
(`led.msgOn` = pedido o visible); confeti dentro del plano en la victoria.
camera: `getShot()` añade `'clinch'`, `'cutaway'`, `'intro'`; `lastCut.kind` añade `'clinch'` (los dos cortes del cierre de set/partido, secos), `'cutaway'`
(vuelta seca del plano corto del sacador rival a la recepción; la ENTRADA a ese plano es un corte `'serve'`) e `'intro'` (entrada de la presentación;
sale con `'serve'`); `VB.CameraRig.playIntro(s)` (main.js al mostrar la tarjeta; 0 = cortar); `clinchLeft()` real; `getDebug()` añade `ft`,
`clinch {phase:''|...|'hero', left, team, why}`, `fovWant`, `fovBoost`, `tfBack`, `defW`, `defF` (`x` con `&camdbg=1`). Lee `ctx.uiDock` y
`ctx.settings.camStable` (temblor 0; `prefers-reduced-motion` lo deja al 30 %).
audio: `VB.Audio.ui('wipe'|'intro'|'introEnd'|'introSkip')`, `sting('intro')`, `introInfo()` → `{active, t}`, `voices()`; `stats.fxIn/fxOut/dribIn/dribOut/
pooled/poolFull/voicesMax/intro/wipe/react`; `ui(kind)` con un nombre desconocido no suena (sin argumento = clic). Sonidos `handclap`, `chest`, `dribble`,
`wipe`, `introSwell`, `introSting`.
ui_main: `VB.UI.introStart(g)`, `introEnd(skipped)`, `wipe(team, cb)` (cortinilla de marca; cortes punto → saque/cambio de campo armados con `nextCutIn`,
transiciones de pantalla de 450 ms), `resize(w,h)`, pruebas `_stamp()`, `_offArrow()`, `_wipe()`, `_wipeLog(on)`, `_endStats()`. El rótulo de set/partido
va en el hueco de ARRIBA durante la órbita del cierre (`getDebug().clinch.phase === 'hero'`) y el indicador de borde (UI-10) solo se ve en planos de juego
(oculto con `getShot()` `'clinch'|'cutaway'|'intro'|'point'|'court'|'over'`).

**Añadidos, arreglos tras la verificación de la ola 2 (8-nov-2026)**:
camera: `getDebug().clinch.x` (pruebas: `[aHd, aHn, pitch, handT, headN, hz0, hz1, vl, anc, ang]`). La órbita del PARTIDO filma a los ganadores desde la grada a la que
miran (de perfil mientras están de cara el uno al otro; de frente cuando players los abre hacia la cámara, frentes a < 60°); el seguimiento lento del cierre
mantiene en cuadro un SUJETO (el defensor más cercano a la marca o, si no, el atacante); en el cierre la mano más alta queda ~3,5 % del alto bajo
`VB.UI.bannerRect()`. En el peloteo, si el balón va a botar a > 0,4 m por fuera en ≤ 1,2 s, la cámara de juego sigue al balón, no al jugador (`lostBall`).
players: en la victoria del partido, 0,5 s después del choque de pecho los dos ganadores se giran hacia la cámara (`VB.ctx.camera.position`), como mucho
35° vueltos hacia el compañero. `sepOffset`: los compañeros nunca quedan a < 0,5 m (offset visual de la raíz, la sim no cambia; 0 en `serveReady`).
arena/fx: mallas fusionadas (para herramientas): `poles` (antenas + postes + protecciones, sustituye a `antennas`/`posts`/`pads`), los filos de luz de las
pantallas van en la malla emisiva (sin `screenStrip`), `focusRing` (un plano con `ShaderMaterial`; sin `focusTarget`/`focusFill`), `floorDecals`
(InstancedMesh: marcas del bote y filos, ondas, marcador de caída, retícula de apuntado, línea de altura; `landMarker`, `aimRet`, `ripple`, `mark`,
`markRim`, `dropLine` siguen como estado fuera de la escena), `impactBills` (destellos y ondas de choque). Nombres de objetos: `floor`, `outerFloor`,
`netFront/netBack`, `endScreen`, `hallName`, `halos`, `camFlashes`, `sparks`, `dust`, `confetti`, `ball`, `ballOutline`, `trail`, `aimArc`.
`VB.FX._dbg()` añade `ringD, ringOp, decals, decOrder, bills, billOrder, dropLine`; `VB.Arena._dbg().screens`; tabla de luz `LT[i].floor` (tinte de la
tarima por nivel). En pantallas de ≤ 560 px CSS de alto, durante saque/peloteo, los marcadores del pabellón que caen en el 40 % superior del cuadro se atenúan al 22 %.
ui_main: `VB.UI.preboot(ctx)` (main.js, con el contexto WebGL creado, antes de montar el pabellón), `VB.UI.bootBusy()`, `VB.UI._boot()` (pruebas);
fuente embebida «VB Marca» en index.html (recortes OFL de Barlow Condensed; solo `.logo` y el rótulo del telón; comprobar con `document.fonts` y una cara
`VB Marca` 900 italic en `status === 'loaded'`); `window.__vbFonts` avisa al momento si la hoja de Google no carga. Relevo del arranque en dos tiempos
(menú pulsable con la escena pintada o a 2,6 s; luego se funde el fondo del telón). Texto del ace con la recepción a la red: «La recepción de la CPU va a
la red» / «Tu recepción va a la red».

**Añadidos opcionales, pulido ola 3 (9-nov-2026)**:
players: `VB.Players._face(p, 'shout'|'effort'|'joy'|'sad'|'neutral'|'', sec)` (pruebas); rig de solo lectura: huesos `eyes, mouth, teeth, brow[2], hair` (27 huesos por
atleta, antes 21; misma textura de huesos y mismo programa), pesos de expresión `fxS/fxE/fxJ/fxD`, `hairAng` (coleta con muelle), `ritOn`, `tgtW`. Proporciones: cadera 1,042 m
(antes 1,0); hombros, cabeza y altura total iguales. Emite `fx:catch` y `fx:call` por `drainFx` (ver §4.3).
arena/fx: `VB.Arena.landmarks.benches[2]` (equipo 0 en x > 0, centro del banco a la altura de las cabezas), `.photographers[4]`, `.tvCamera` (coords de sim, fuera de la zona
libre: objetivos de plano, no posiciones de cámara); `_dbg().crew`, `_dbg().crewReact(team, big, 'point'|'set'|'match')`, `_dbg().POSE`; la malla `officials` incluye ahora
el entorno de pista (banquillos, fotógrafos, cámara de TV; `userData.lowIdx` = recorte de baja con `setDrawRange`); `ledRefl` tipo 3 (vidrio de la barandilla, uniforme
`glassK`); `Builder.cbox()` (caja achaflanada); programa de la grada `vb-crowd-6` (asientos de prensa sin ola ni saltos). `finishLedRefl()` cierra `ledRefl` tras la grada.
camera: `lastCut.kind` añade `'attract'` (cortes de la realización del menú; la UI no los tapa con cortinilla). `playIntro(s)` acaba en el encuadre del primer saque y cede
SIN corte (`nextCutIn` = -1 mientras dura; saltarla con `playIntro(0)` sigue cortando con `'serve'`). `getDebug()` añade `menu`, `menuT`, `blk`, `board`, `pbNar`, `pbW`, `pbD`;
pruebas `VB.CameraRig._serveDbg()`, `_boardGuard()`; URL `&camBreak=clinch|serve|board|menu|block|clutter|hitstop|intro|cut` (solo pruebas). El saque propio usa `ctx.isTouch`.
Lee (con guarda) `VB.Arena._dbg()` refs/judges, `VB.UI.bannerRect()` y `VB.Arena.landmarks.scoreHung`. input.js: degradados más oscuros en GOLPEAR/SACAR y SALTAR (≥ 4,5:1).
audio: `VB.Audio.ui('count', u, ts)`, `ui('countEnd')`, `ui('mvp', win)`, `ui('arrowHover', dir)`, `ui('arrow', dir, nivel, n)`, `ui('arrowEdge', dir)`, `ui('optHover')`,
`ui('toggle', on)`, `ui('select', i, n)`, `ui('slide', v)` (`ui()` acepta hasta 3 argumentos tras el nombre); `stats.count/countAt/countEnd/countEndAt/mvp`; `_debug()` añade
`crowd`, `endFocus`, `count`, `stingTeam`; sonidos `cntTick, cntLock, arwHover, optHover, stepUp, stepDown, arwEdge, tglOn, tglOff, optSel, mvpWin, mvpLose`. Con la hoja
final a la vista (state `over`) la grada baja 6 dB. ui.js lo cablea: tics en cada frame de la cuenta con cambio y «clac» en el último, MVP al empezar la cuenta, flechas
de dificultad (paso/tope/hover) y filas de Ajustes (hover, Sí/No, varios valores, deslizador).
ui_main: `VB.UI.callout(text, team, cls, dur, o)` (`cls` `'neg'|'good'|'tip'` = respuesta personal; `o.html`, `o.gauge` −1..1 medidor pronto/tarde), `VB.UI._prompt()` (pruebas);
Ajustes sin fila de dificultad (está en el menú), agrupados Audio · Imagen · Juego · Accesibilidad; glifos PlayStation (✕ ○ □ △) si `padInfo().id` es de Sony; `#srLive`
(aria-live) con el tanteo hablado y `lang="es"`. La cinta grande del punto sigue a `highlight ≥ VB.HOLD.bigAt` (+ ace y punto de set salvado; subtítulo «Final apretado» con `clutch`).

**Añadidos opcionales, arreglos tras la verificación de la ola 3 (9-nov-2026)**:
sim: `checkBody` no da toque de cuerpo de su propio equipo a un jugador de IA (no `isHuman`) cuando sería falta (`g.lastPlayer === p` o `g.touches >= 3`) o el
compañero soltó el balón hace < 0,3 s (el humano sigue expuesto a la regla); ai.js `TEAM_GAP` 0,2 s y `dodgeOwnBall` (`DODGE_R` 0,9 m). `VB.HOLD.set` = 4,0 (antes 3,4; CAM-09).
players: con la sim parada en una escena de depuración (`ctx.frozen && ctx.debug && dt <= 0 && g.mode === 'point'`) la celebración se representa como cuadro vivo
en bucle (re-emite el `point`, así que `fx:highfive` y familia llegan a FX/audio/UI también en `debug=point|ace`); pruebas `VB.Players._tab()` → `{t, max}`.
arena: la señal `antenna` del 1r árbitro es «balón fuera» (`POSE.outFa`); señalar la antena es del juez de línea (`judgeSignal`). `POSE.antenna` desaparece.
camera: `getDebug()` añade `svcEval`, `svcOff` (candidatos del saque y proyecciones de oficiales de este frame) y `bgP` (desvío de cabeceo del plano final, °);
en el plano `over`, `board` vale `'baja'|'fuera'` (marcador colgado y pantallas LED de los fondos siempre fuera por arriba). Hit-stop con tope nominal + 2 frames.
ui_main: chip de la jugada «JUGADA · N» y subtítulo «¡Jugada de N toques!» (visible: «Jugada», no «Peloteo»); `.rl.fade` (animación `rlFade` 0,25 s) al salir el rótulo de
set/partido; `placeT3` coloca `#banner` fuera del marcador entero, `.hud-btns` y la pausa táctil (mueve el centro con `style.left`; `&uidbg=1` registra candidatos);
`#coach.thru` (0,28) y `#guide.thru` (0,22) en todas las pantallas; `tryReveal` no empieza relevo en escenas `debug=`.

**Insignias y Carrera (ui_main)**:
- `VB.Badges` (js/badges.js, sin DOM): `LIST` (`{id, name, icon (SVG), desc, fx[3], cond, unit, th [bronce, plata, oro]}`), `IDS`, `BY`, `TIERS`, `ingest(e, g)` (ui.js la llama con
  cada evento; solo cuenta partidos humanos del equipo 0: no demo, autopilot ni depuración), `endMatch(g, win, athletes?)` → `[{slot, num, id, name, lvl, prev, tier, eq}]`
  (por defecto el escuadrón de Partido rápido, que guarda; con atletas propios —Carrera— guarda quien llama), `forPlayer(a)` → `{id: nivel}` de las EQUIPADAS,
  `forSquad()` → `[[b7, b11], null]` o null, `slots(a)` = mín(6, 2 + floor(nivel/5)), `toggle/equip/unequip(a, id)`, `progress`, `level`, `label(u)`.
  Progreso en cada atleta de `VB.Prog`: `a.bp` (contadores), `a.bd` (`{id: nivel}`), `a.beq` (equipadas).
- `VB.Prog` (js/prog.js) añade funciones sobre un atleta cualquiera (no guardan): `newAthlete(o)`, `saneAthlete(a)`, `athleteAddXP(a, xp)`, `athleteBump(a, k)`, `athleteAttrs(a)`, `squad()`.
  `attrs()` → `[[n.º 1, n.º 2], cpu]`: la CPU de Partido rápido juega sin atributos (`null`) mientras la media del escuadrón sea ≤ 50 y, por encima, con
  `cpuSt(m)` = 50 + `CPU_K` (0,6) × (m − 50) en todo (integración 10-nov-2026: con 90 ya no se gana el 75 % al Experto).
- `VB.Career` (js/career.js, sin DOM; guardado `voley3d.career`): `exists/get/create/abandon/save`, `next(c)`, `matchSetup(c)` → `{attrs, badges, points, difficulty, ctrl,
  ctrlIdx, ref, kit, rivalKit, career}`, `ingest(evs, g)`, `matchDone(r, st, g)` → resumen `{nota, xp, lvlUp, lvl, ptsGained, badges}`, `simulateNext(c)`, `abortMatch()`,
  `table(c, lvl)`, `bump(k)`, `toggleBadge(id)`, `acceptOffer(i, años)`, `stay(años)`, `lost()` (había un guardado que no se pudo reparar; copia en `voley3d.career.bak`).
  Gestión (v2, notes/carrera.md §Gestión): fase `'pick'` sin club al crear (`rejectAll()`, `moreTime()`), `negotiate(i)`, `setTraining(k)`, `requestTransfer(on)`,
  `changeMate(i)`, `clubInfo(c, k)`, `unread/readMsg/readAll`; `matchSetup().ctrl` siempre `'one'` (la Carrera no ofrece «Los dos»).
  Integración (10-nov-2026): `earlyExit(c)` (fichar ahora sería salir con contrato en vigor: el entrenador nuevo empieza con `EARLY_COACH` menos),
  `STYLE_TRAIN`/`STYLE_PROG` (el estilo del club suma progreso de entreno a un grupo), `ROLE_COACH`, `NEG_COACH` (negociación rechazada → `oferta.negNo`);
  la fatiga vuelve a 0 en verano y Equilibrado no cansa; la petición de traspaso caduca con la temporada.
  Ofertas: `{club, lvl, ovr, mate, interest, role, years}` (`lvl`/`ovr`: liga y media de la temporada en la que jugarías).
- `VB.CareerUI` (js/career-ui.js): `open(view?, o?)`, `isOpen()`, `back()`, `nav(it, dt)` (mando; main.js la llama en lugar de `VB.UI.nav` mientras está abierta).
  Sus dos barras (apartados u ofertas, y sub-pestañas) son `VB.UI.tabs` (ids `#crTabs`, `#crSub`): Q/E y LB/RB (o Y) el primer nivel, RePág/AvPág y LT/RT el
  segundo, ←/→ con el foco en una pestaña, deslizar el dedo sobre `#crBody`. «‹ Jugar» vuelve a la página Jugar del menú.
- main.js: `ctx.actions.startCareerMatch()` arranca el partido de Carrera con `createGame({attrs, badges, points, difficulty, ctrl, ctrlIdx, ref, nums})`, marca `g.career`
  (`{season, week, label, me, rival, meName, rivalName, player, num, mate, mateNum, …}`) y viste los dos equipos (`Players.setKit({...kit, rival: rivalKit})`). Con `g.career`
  ui.js no reparte XP ni insignias al escuadrón (lo hace `VB.Career.matchDone`, que main.js llama al llegar `gameOver`) y el marcador muestra las abreviaturas de los clubes.
  Partido rápido: `badges: VB.Badges.forSquad()` (salvo autopilot y depuración; `&nobadges=1` las quita).
- players: `setKit(st, g)` acepta `st.rival = {kitShirt, kitAccent, kitShorts, kitPattern}` para el equipo 1 (si se parece demasiado a la tuya, la CPU de siempre).
- fx: diana del saque (`g.mode === 'serve' && g.aim3.on && g.aim3.kind === 'serve'`), turquesa (dorada con `spreadNow` < ~0,45 m); notes/arena.md.
- main.js: en `g.mode === 'serve'` la entrada se pasa a mundo con los ejes de la PISTA (el más cercano de la base de la cámara), no con la
  base girada: ↑ lleva la diana recta al fondo y ←/→ solo a lo ancho.
- ai.js: la IA deja botar el saque rival que se va fuera (`leaveServe`, una decisión por saque y equipo en `g._lv`).
- ui.js: en un partido de Carrera los textos con «CPU» (cintas, avisos, consejo, lector de pantalla, rótulo del challenge) pasan por
  `cpuTxt` («Remate del rival», «Tú 3, PUE 1»), y el partido no cuenta para el récord de Partido rápido (`voley3d.record`).

**Cámara (convención)**: los cambios de jugador SIEMPRE deslizan (nunca corte). El plano de reacción del punto (camera.js `planPoint`) usa
cortes deliberados de retransmisión (a ~0,45 s del bote y de vuelta al saque si cruza la red o está a > 11 m); no son cambios de control.
**Señal de golpeo (una sola ventana)**: el brillo de GOLPEAR/SACAR (input.js `CUE_OFF/CUE_ON`), el aro que se cierra sobre el botón (`.vt-ring`, clase `.cue`),
el aro amarillo de la pista (fx.js) y el aviso "¡Golpea!" de ui.js (`HINT_OFF/HINT_ON`) usan `hitWindow().press` en (−0,15, 0,24). Si cambia, cambiar input.js, ui.js y simtest a la vez.
input.js escucha `pointerdown` en captura sobre `window` (1r toque tras jugar con mando); un control de UI se excluye con `data-ui`.
El plano de héroe dicta la coreografía de la celebración: el que anota, de cara a la cámara; el compañero llega por detrás y a un lado (`heroShot`). El plano de reacción entra siempre por corte a los 0,45 s;
la vuelta al saque se anuncia en `nextCutIn` y casi siempre es corte.
El cierre del set/partido (CAM-09) entra por corte al seguimiento del balón a cámara lenta y corta otra vez a la órbita de los ganadores (`'clinch'`). Antes de cada saque rival hay un plano corto del sacador (CAM-14, 0,95-1,4 s) que vuelve a la recepción ≥ 0,55 s antes del lanzamiento. Tras nuestro ataque la cámara sigue el balón hasta el bote (CAM-08), sin corte.
El cambio de campo (`courtChange`, plano `'court'`) usa un corte deliberado (reacción → grúa alta por la banda de la mesa) y baja SIN corte al plano del saque; la base de control queda congelada durante la grúa.

**Sprint 5 en los módulos de presentación** (todo opcional y con guarda):
- **Input** (E3): `OPTS`, `DEFAULT_KEYS` (11 acciones × 2 teclas), `DEFAULT_PAD {hit:[0], jump:[1], jset:[2], sw:[3], chal:[6]}`,
  `onSettings(s, k)`, `bindings()` → `{keys, pad, padStd, padFam, acts, padActs, fixed}`, `rebind(kind, act, slot, code)` → `{keys|pad, swap,
  err: '' | 'reserved' | 'empty' | 'primary' | 'bad'}`, `captureNext(kind, cb)` → cancel (cb(v, why) con why 'key' \| 'pad' \| 'clear' \|
  'cancel' \| 'timeout'; 6 s; Esc / Start cancelan; escucha en fase de captura, sin fugas), `capturing()`, `keyName(code)`, `padName(i, fam)`.
  `poll()` añade `navOk / navBack / navTab` (botones fijos 0, 1 y 4/5 del mando); `confirm` del mando = navOk o Start. `glyph()` cubre
  hit/jump. Fijas: Esc, Enter; reservadas: Tab, F1-F24, F, modificadores, ContextMenu, Backspace/Delete. El botón táctil COLOCAR usa
  `Sim.altReady` y lee «COLOCADO» con 'roll'. `--vts` (CSS) = `touchSize`.
- **CameraRig** (E3/E6): `OPTS = ['camDist','camCuts','lessMotion']`; `distK` 0,86 / 1 / 1,18; con `camCuts 'less'` o `g.drill` el punto
  no tiene plano de reacción, de héroe ni del sacador rival (`heroShot()` null) y la vuelta al saque es un corte 'serve' sin `nextCutIn`;
  `drillStage` → corte seco `lastCut.kind 'drill'` (sin cámara lenta, hit-stop ni seguimiento del remate). Intro, cierre de set/partido y
  grúa del cambio de campo, igual. El 6v6 no cambia.
- **FX** (E3/E6/E1): `OPTS = ['cbColors','ballStyle']`, `onSettings(s, k)`; paleta para daltónicos (bote dentro azul / fuera naranja,
  retícula ámbar → azul perfecta, aro al filo magenta) y balón de contraste (textura rehecha una vez). Diana del ejercicio desde
  `g.drill.target` en el lote de calcomanías (0 dibujos más), pulso apagado con `ctx.reduceMotion`, destello con `drillRep.pts >= 3`.
  Retícula `kind 'roll'` verde, aro coral con `edge > 0,5`, marcador `Sim.setPreview` por tempo, sin estela con `shot 'roll'`, estela
  dorada con `chain >= 3`.
- **Audio**: `preview(kind)` ('crowd' \| 'sfx' \| 'music' \| 'master' \| 'volume'; false antes del 1r gesto o en silencio), `stats.chain`;
  maneja `fx:floor`, `feint`, `drillRep`, `drillEnd`, `hit.shot 'roll'`, `hit.style 'jfloat'` y `hit.chain`.
- **Players** (E2): `CELEBS [{id, name, tier}]` (mismos ids que `CareerLife.CELEB_DEF`), `setSignature(id)` → id aceptado \| '',
  `setRival(num)` (vale para el partido que se crea con la llamada; -1 o ninguna llamada lo limpia). Rig de solo lectura: `persona, cvar,
  dvar, lvar, idle`. Pruebas: `_anim(p)` → `{persona, cvar, dvar, lvar, idle, celId, celV, leave, evG, blk, sig, rival}`, `_celeb(p, id)`,
  `_idle(p, id, u)`. `rigOf` puede ir hasta 10 cm por debajo de la sim 70 ms al despegar sin carrera y hasta 0,55 m por delante tras un
  saque en salto (pasitos que se recuperan como el desfase de la plancha). Con `g.drill`: sin celebración, convergencia, piña ni idle.
- **UI**: `openAbout(tab)`, `_about()` → `{seen, returning, auto}`, `_settings()` (prueba), `menuGo('gym')` y `menuPage()` → 'gym';
  `openPanel(name, {from, tab, focus})` con una sola pila de vuelta (Atrás / Esc / B vuelven a la pestaña y fila de origen). Ajustes con 7
  pestañas (audio, image, cam, game, a11y, kit, info; modo compacto de solo iconos si no caben) y filas con `data-need` (se esconden si el
  módulo no publica la opción en su `OPTS`).
- **VB.Gym** (js/gym.js, sin DOM): `DRILLS [{id, name, short, help}]` (6), `IDS` (5 con medalla), `MEDALS` (reserva = los de `VB.DRILL`),
  `medalsOf(id)`, `XP [30, 50, 80]`, `MAX 30`, `MEDAL_NAMES`, `load/save/clean/get/drill/medalOf/record/recordRally/count/nextOf/bestRally/
  reset`. `record(id, total)` → `{best, prev, isBest, medal, newMedal, xp, n}` y da la XP con `VB.Prog.addXP(0/1)` una vez por nivel (ui.js
  no la da por su cuenta). `VB.Account._mergeGym/_gymSync` (fusión por máximo, apagada).
- **Versión** (js/version.js): `VB.VERSION`, `VB.VERSION_DATE`, `VB.CHANGELOG [{v, d, t, items}]`, `VB.CREDITS {by, tools, fonts,
  licenses:{three, threeLine, ofl}, note}`; en Pages, `window.__vbBuild = {v, sha, date}`.
- **Carrera** (E2/E4/E5): `VB.CareerLife.celebs/setCeleb/signatureNow/CELEB_DEF`; `m.career.rivalNum` (solo en los duelos, lo pone
  `setup()`). `VB.CareerWorld`: `hook, ensure, MENTOR, BEATS, BEAT_ORDER, LINE_MAX, Q_MAX, mentorScene(c), mentorDone(), mentorSkip(),
  mentorSkipAll(), setMentor(on), mentorOn(c), news(c, n), newsUnseen(c), markNewsSeen(), newsWhen(x), lore(c, k), clubRows(c, lvl),
  clubCard(c, id), leaguesOf(c), TPL, NEWS_MAX, ANNALS_MAX, W_SUMMER, W_END, MKT`. `VB.CareerWorldUI`: `mentorCard, optsHTML, headlines,
  newsHTML, clubsHTML, act, back, reset, focusSel, isCard, css, FACE`. career.js `life()` llama a CareerLife y después a CareerWorld, y
  `life(c, 'join', o)` al final de `joinClub`. Bandeja: tipo nuevo `k 'mentor'` (solo escenas no vistas).
- **Titularidad y cambios** (13-nov-2026, notes/titularidad-y-cambios.md; contrato Carrera ↔ partido en su §I). Arreglos tras la revisión:
  `canSub/requestSub` del humano devuelven `'role'` si no es del mismo puesto u OH↔OPP (ui.js lo desactiva en el menú «Cambios»); un
  challenge anulado deshace también `perf`, `onR` y `tired` del punto (`g._subU`); el evento `'lineup'` del equipo 0 sale también sin cambio
  de alineación si tu atleta pasa de pista a banquillo o al revés al empezar el set (`meIn` / `meOut` = cambio de estado); los pares de
  `g.subs[t].pairs` llevan `src` (regla que lo decidió: tu entrada con el partido roto es `why 'meIn', src 'garbage'` y no te deja de
  inicio el set siguiente). ai6 `COACH.garbageShort/garbageLate`: en sets de menos de 25, partido roto = diferencia ≥ 7 a 4 puntos o menos
  del final; tu entrada así solo en el set que decide el partido y nunca tras sacarte en ese set; doble cambio solo con 2 cambios hechos
  como mucho. career.js: las ofertas llevan `depth` (con su rol: Titular +3, Indiscutible siempre de inicio, y la confianza de llegada) y
  `dm` (solo nivel: decide el tope del rol y la negociación); `c.sq6.outC` (la jornada anterior te dejó fuera el entrenador: no dos
  seguidas; el Titular va al banquillo, nunca fuera, por confianza baja); migrar un guardado sin `c.sq6` no te hace recién llegado.

**Sprint 2-4 (15-nov-2026).** Todo opcional y con guarda; detalle en `notes/s234/T*.md` y en `notes/<dueño>.md`.
- **players** (players.js): `bindReplay(g|null)` (los rigs pasan a los jugadores de la sombra por id y vuelven; con null re-emite el último
  `point` en vivo), `baseLook({team, idx, num, role, beach})` (L sin el Vestuario, para el retrato), `setMate(o|null)` con `o = {num,
  pers|persona, sig, rage}` → `{persona, sig, rage}|null` (tu n.º 2 del 2v2), `setBoss(o|null)` con `o = {idx, num, fit, style, pers, sig,
  rage}` → dorsal|-1 (con `fit` = `VB.Look.bossFit`, clave de caché `':boss' + sig`), `setPairChem(lv 0-3)`, `_pair(type)` (pruebas),
  `NPC_SIGS` (6 firmas), `RAGES` (6 rabias); `_anim(p)` añade `mate, boss, sigId, rageId, pair, cvType`. Convergencia tipo 6 (saludo de
  pareja, `fx:highfive`×2 + `fx:fistbump`), celId del cierre `'matchSig'`/`'matchRage'`, `celV` nuevos `'grito'`/`'manotazo'`. Las
  celebraciones eligen con `hash32(g.seed, setNo, marcador, id)` (R12), nunca con `Math.random`. No existe `CEL_IDS`. Ancla de bloqueo `blk`
  (modo 9), plataforma a la bisectriz y marcador oculto con `g.replay`. Con los ganchos a null todo queda como antes (salvo que tu n.º 1
  con firma la hace también en el cierre).
- **players** (doll.js): `VB.Doll.portrait.{key(req), draw(ctx, req, out2d) → ms|-1, free(), warm(ctx) → {scene, camera}, stats(), info()}`,
  `req = {L|fit, tc, num, beach, pose:'stand', face:'neutra'|'alegria', yaw:0.35, bg, size, zoom?}` (escena propia, tijera abajo a la
  izquierda, sin segundo renderer). Encuadre según el tamaño (`ptZoom`: cara a ≤ 44 CSS px, busto a ≥ 88). Los 5 objetos de jefe dibujados
  en `ITEMS` (`munhCanon`, `dedosMuro`, `manguitoMazo`, `rodiPulpo`, `tobiPulpo`) con el hook `G.vc` (color por triángulo).
- **camera_input:** `VB.CameraRig.replay(on, {kind, slowFrom, slowTo, fx, fy, fz})` (tiempos en `R.time`; `tvShot` + acercamiento ×0,85
  sin «Menos movimiento»); `getShot()` → 'replay'; `getDebug().replay = {on, k, kind}`; `shake`/`punch`/`hitStop`/`slowmo`/`heroShot`
  callan durante la repetición. input.js oculta los mandos táctiles con `ctx.replay`.
- **arena:** `VB.FX.replay(on)` (guarda y oculta marcas, huellas y la línea del challenge; apaga partículas; al salir lo restaura). Con
  `g.replay`: sin aro, retícula, guías ni `setPreview`.
- **audio:** `VB.Audio.UI_KINDS` (26 tipos), `ui('tab'|'panelIn'|'panelOut'|'beat', i|'rank', d|'unlock'|'medal', m|'rotulo', tipo, equipo,
  retraso)`, `introStart(dur)` (la grada a medias en la previa larga), `replay(on)` (grada −6 dB). `stats.rot`, `stats.ui2`, `stats.rplCut`.
- **ui_main** — `VB.UI`: `portraitHTML(req, cls, alt)`, `portraitReqMatch(team, idx, px)` (null para el rival), `introPlan(g, o)`,
  `introStart(g, plan)`, `endCareer(sum, g, x)` (sustituye a `careerEndSheet`; `x = {tbl, myId, short, pos, next, bar, ses}`),
  `replayWipe(cb)` (false si ya hay cortinilla), `replayDone()`, `openRetos(tab)`, `openProfile({tab})`, `refreshMenu()` (también limpia el
  chip del perfil), `menuGo('prof')`; pruebas `_recap()`, `_intro()`, `_hero()`, `_rot()`, `_retoEnd()`, `_profEnd()`, `_prof()`.
- **ui_main** — `VB.Recap.{ord, move, trait, introPlan, history, stake, headline, playPhrase, tableSlice, endModel, DUR:{mini:2.5,
  short:4.5, long:6}, END_CELEB:3, TRAITS, STAKES}` (más `h01`, `RULES`, `ordw`, `partParts`). Ordinales «1r» «2º»; «Punto de set».
- **ui_main** — `VB.Replay.{reset(g, o), enabled, onStep(simIn, g), onEvents(g, evs), autoReady(g), start(kind, j, onEnd), playBest(i,
  onEnd), tick(realDt, outP, outF), skip(all), abort, active, runner, info, list, bestCount, desync, prepMs, cut}`, `K` (con `TAIL = 156`),
  `PASS`, `TXT`. Solo 2v2 humano (no 6v6, ejercicios, demo ni espectador).
  Online (fase 6): `reset(gc, {dual: true, slot})` graba la partida CONFIRMADA: `onStep(ins, gc)` con `ins = [hueco 0, hueco 1]` (las de
  `Session.stepInputs()`, con los bits chal/skip/tmo/ai) y `onEvents(gc, r.confirmed)` (canónicos). La repetición resimula con las dos.
  Con `slot: 1`, `runner()` devuelve una copia GIRADA de la sombra (`VB.NetView.mirror`) y los eventos de `tick` salen girados
  (`NetView.mapEvent`); `list()` / `info()` dan el marcador y el equipo desde tu lado y la puntuación extra va a TU equipo. `cut()` = el
  peloteo en curso no se repite (reparación con foto o vuelta). El modo offline (sin `dual`) no cambia de formato ni de resultado.
- **ui_main** — `VB.UI.netTally(evs | null)` (fase 6): estadísticas de la hoja final online con los eventos CONFIRMADOS ya girados para
  el invitado (main.js `netConfirmed`); null = vaciar. En el online, lo presentado (predicho) solo cuenta para los banners (`pstats`).
  Auditoría (17-nov-2026): `VB.UI.netStatsSet(stats)` (main.js vuelve a una copia de la hoja tras un resync con la IA de por medio).
- **ui_main** — `VB.Retos.{LIST, ingest(e, g), endMatch(g, info, dry), daily(k?), summary, clean, mergeRaw, profileXP, album, chainOk(e,
  n?)}` y `level`, `progress`, `count`, `unseen`, `markSeen`, `today`, `dayState`, `lookData`, `lost`, `readOnly`.
- **ui_main** — `VB.Profile.{need, levelOf, level, xp, stats, noteMatch(o) (= addMatch), noteGym(id), check() → {lvlUp, hitos, grants},
  album() → {tabs, have, total}, vitrina, pin, unpin, unseenCount, markSeen, nextPrize, footText, load, pack, lost, readOnly, mergeRaw,
  clean}`, `HITOS` (16), `LVL_XP`.
- **ui_main** — `VB.Look` añade los desbloqueos `{boss}`, `{reto:{id, m}}`, `{retoN}`, `{dias}`, `{semana}` (sin usar), `{lvl}` y `{chem}`;
  orígenes `'retos'`, `'hito'`, `'boss'`; `bossFit(style, seed)`, `bossItems(style)`, `BOSS_STYLES`, `BOSS_NAME`, `LVL_PRIZES` (8),
  `lvlPrize(n)`, `unlockText(u, hall)`, `drawId(slot, id)`, `lost()`, `readOnly()`.
- **ui_main** — `VB.Account.menuReady()` y los interruptores `S4_SYNC`/`LOOK_SYNC`/`GYM_SYNC` (§1); cola de conflictos de Carrera (playa y
  pista), tope de 390 000 caracteres por documento.
- **ui_main** — Carrera: `VB.CareerUI.open(v, {from:'main'|'play', fresh, focus:'play'|'train'|'bench', res})` (R15), `from()`,
  `heroData(c)` (puro), `syncHero()`, `portraitReq(c, who, px, face)`, `crest(k, px, c)`; `VB.CareerWorld.crestOf(k, mode)`,
  `trophyCase(c)`, `newsBoss(c, boss, wk?)`, `BEATS.ses1`; `VB.CareerWorldUI.crestSVG(k, px, o)`, `trophyCaseHTML(c, H)`;
  `VB.CareerLife.boss(c)`, `bossFor`, `bossInfo`, `bossBeaten`, `mateAnim`, `bossAnim`, `chemLevel`, `chemName`, `chemInfo`, `chemCheck`,
  `ACH_INFO` (32 logros; `boss3` solo playa), y en `setup`: `m.career.boss`, `bossNum`, `bossAnim`, `mateAnim`, `chemLv`, `chemName`,
  `pairSign`, `rivalP`, `rivalStyle`. `VB.Gym.ATTR`, `VB.Gym.lost/readOnly`, `VB.Prog.lost/readOnly`.

## 5. Orden por frame (main.js)
1. `realDt = min(maxdt, Δ)`; `resize` si cambió el contenedor.
2. `it = Input.poll(realDt)`; `it.pause` → `togglePause`; `it.mute` → `toggleMute`; `it.any` → `Audio.unlock`.
3. Si no está en pausa/congelado/vertical: entrada → mundo con `CameraRig.getBasis()`; acumula `realDt*timeScale` y
   ejecuta `Sim.step(game, 1/120, input)` N veces (flancos solo en el primer subpaso); `drainEvents` → `events`.
   Si llega `gameOver` en partido → `state = 'over'`. Con la tarjeta de presentación (`ctx.introLeft > 0`) la sim no avanza y los eventos iniciales salvo `newMatch` llegan al acabarla; cualquier botón la salta (sin golpear ni pausar). Antes del bucle de pasos: en `'point'`/`'over'` jugando, GOLPEAR, SALTAR, CAMBIAR o ACEPTAR llama a `Sim.skipHold(g)`; si recorta, se consume
   el flanco y se avisa a `UI.onHoldSkip()`.
4. `Arena.update(g, gdt, ev)` → `Players.update` → (main.js añade a `ev` los `fx:*` de `Players.drainFx`) → `FX.update` → `CameraRig.update(g, realDt, ev)` →
   `Audio.handle(ev, g)` → `Audio.update(g, realDt)` → `UI.update(g, gdt, ev)`.
5. `renderFn(ctx)` o `renderer.render(scene, camera)`.
6. Calidad adaptativa (ventanas de 2 s): baja un nivel (`setQuality`) tras 2 ventanas < 45 fps o 3 seguidas < 52; en "baja" reduce la escala de render solo si
   el cuello es la GPU (`ctx.cpuBusy` < 0,40); tras cada escalón de escala mira 2 ventanas y, si los fps no suben ≥ 15 %, lo deshace y no vuelve a escalar en la
   sesión (cambiar Calidad en Ajustes lo reinicia); sube tras 5 ventanas > 58 fps; ignora la ventana que sigue a un cambio de calidad/estado/pausa
   y los primeros 8 s reales tras el arranque (`&aqwarm=s`).
   Desactivada con `?quality=` o en depuración (salvo `&aq=1`). En el móvil, bajar de calidad no cambia el tipo de sombra ni el número de luces
   (sin recompilar materiales). En el escritorio todos los niveles usan sombra PCF suave y "baja" usa mapa de 1024 (móvil: 512, PCF).

**Sprint 2-4 (15-nov-2026):**
- **Paso 4b (retratos):** con `PQ.length && (state 'menu' | 'over') && drawn ≥ 3 && !progWarm.gate`, `portraitStep()` (uno por frame) justo
  antes de `renderer.info.reset()` y del render. Cola vacía = cero asignaciones; vacía 1 s → `VB.Doll.portrait.free()`.
- **Repetición:** tras cada `Sim.step` en vivo, `Replay.onStep(simIn, g)`; tras `drainEvents`, `Replay.onEvents(g, events)` y
  `if (Replay.autoReady(g)) Replay.start('auto')`. Con `Replay.active()`, `rpInput(it)` consume los flancos (saltar / salir). Si
  `R = Replay.runner()` (fases 'play'/'out'), la sim en vivo NO avanza y se pinta R: `Arena.update(g, dt, EMPTY)` → `Players.update(R, gdtR,
  evP)` → `drainFx` (`replay = true`) → `FX.update(R, gdtR, evF)` → `CameraRig.update(R, dt, EMPTY)` → `Audio.handle(evF, R)` →
  `Audio.update(g, dt)` → `UI.update(g, 0, EMPTY)` → render. En 'prep'/'in' se pinta el vivo. `idleT` no corre con una repetición activa.
- **Celebración (R11):** con `matchWon`, la hoja final espera `END_CELEB` (3 s de tiempo vivo, sin contar la repetición) también en
  escritorio, y nunca se abre durante `ctx.replay`.

## 6. Depuración y verificación
- `node tools/simtest.js [min] [seed] [minMatriz=20] [semillas=4]` (+ `SIMTEST_ONLY=matrix`, `MATRIX_FILTER=<regex>`; rápido: `node tools/simtest.js 10 12345 0`) — sim headless: CPU vs CPU, autopilot, fuzz aleatorio, humano heurístico, reglas (4 toques, dobles,
  set a 25 con 2 de diferencia, tie-break a 15, punto de set). Sale ≠0 si falla. **Debe pasar siempre.**
- `tools/shot.sh <escena|all|a,b,c> [W] [H] [out.png|carpeta] [params]` — captura (envoltorio de `node tools/shot.js`). Viewport EXACTO
  (DevTools `Emulation.setDeviceMetricsOverride`; `--window-size` en headless de Windows recorta ~16×151 px) y GPU real.
  `WAIT=ms` (o `VTB`) = espera en tiempo real tras cargar (4000); `TOUCH=1` emula pantalla táctil. Con varias escenas reutiliza un Chrome.
- `tools/console.sh <escena|all> [W] [H] [params]` — mensajes de consola de la página; sale 1 si hay excepción, `console.error`, `[VB][ERROR]` o error de WebGL.
- Chrome: `tools/chrome.js` (node) y `tools/chrome-env.sh` (bash) eligen ejecutable y GPU (ANGLE d3d11 en Windows, metal en Mac, gl en Linux;
  `GL=swiftshader` para máquinas sin GPU, `CHROME=/ruta`). `tools/cdp.js` = cliente DevTools común (viewport exacto, errores, capturas).
- `node tools/drive.js [W] [H] [seg] [query]` — juega de verdad con teclado vía DevTools (menú → Intro → saque → peloteo → colocación en salto con K y con rueda + clic derecho, `tools/jsetdrill.js` → pausa); touchplay.js y padplay.js hacen el mismo ejercicio con COLOCAR y con X.
- `node tools/perf.js [WxH=844x390] [s=20] [niveles=auto,high,medium,low] [cpu=4] [dpr=2.75]` — móvil emulado (viewport, dpr, táctil, UA,
  freno de CPU) y partido real con autopilot: fps, p5, coste JS, GC, draw calls, triángulos, sombra, calidad adaptativa. `STRICT=1` (sale con 1 si no se cumplen los objetivos o si la medida no es válida), `ALLOC=1`, `PROFILE=1`, `DESKTOP=1`, `WARM=s`
  (10 por defecto; 45 con `ALLOC/RETAIN`: V8 optimiza por número de llamadas), `HOSTMAX=%` (80 por defecto: si la CPU del PC anfitrión pasa de ahí de media en un nivel,
  la medida no es válida: columna `host%` con `!`; JSON `hostCpu`, `hostCpuMax`, `valid`, `invalid`). La CPU del anfitrión incluye al propio Chrome (~45-55 %).
  `ALLOC=1` (perfil de asignación muestreado) altera la optimización de V8: sus KB/s por fichero dan dirección, no valor absoluto; para GC, contar recolecciones sin `ALLOC`.
- `node tools/touchplay.js [tamaños] [s]` (multitáctil real sobre el overlay), `node tools/padplay.js [W] [H] [s]` (mando falso de mapeo estándar),
  `node tools/touchtest.js [WxH]` (30 casos de táctil), `node tools/padtest.js` (26 casos de mando), `node tools/courttest.js set|eight [WxH] [touch]`
  (plano del cambio de campo jugando hasta el evento), `node tools/audiotest.js` (mezcla medida: LUFS por escenario, partido renderizado en Chrome).
- `node tools/eval.js "<query>" "<expr>" [ms] [WxH]` — evalúa JS en la página (p. ej. `JSON.stringify(VB.ctx.renderer.info.render)`); espera Promises;
  `SHOT=out.png` captura DESPUÉS de evaluar (aislar artefactos, inyectar eventos con `VB.FX._event`, mover la cámara…).
- Escenas `?debug=`: `menu serve hud rally spike block point ace setpoint switch over|end mobile pause tutorial controls settings toss jumpserve dive`
  y, del 6v6 (espectador, sprint 2; no hace falta `&format=6v6`): `serve6` (sacador con el balón lanzado, `&n=N` el N-ésimo saque, 3r por defecto; `&t=s`),
  `rally6` (colocación del equipo 0 tras la recepción) y `point6` (el punto con su plano). Están en `shot.js all` / `console.sh all`.
- **6v6 espectador (sprint 2)**: `?format=6v6` (NO en el menú) hace que «Jugar» empiece CPU contra CPU (`autopilot` + `present`, sin presentación)
  con `g.watch = true` (marca de main.js, la sim no la lee) y `ctrl: 'one'` (sin eventos `switch`): ui.js rotula LOC / VIS (también en la pestaña del punto: «Remate del rival», nunca «de la CPU»), no enseña avisos de mando ni cuenta el partido en el récord;
  input.js no enseña los mandos táctiles; players.js no pinta el halo ni la flecha del controlado y fx.js no pinta el aro amarillo; camera.js usa el plano `tv` (cámara de televisión alta tras el fondo del equipo 0, encuadre de los 12
  jugadores; con `g.size === 6` también en partidos de autopilot) para saque, peloteo y punto (corte al saque siguiente); cambio de campo y final como en 2v2;
  sin plano de reacción, cierre de set ni plano del sacador rival. `node tools/tv6test.js [WxH] [s] [semilla]` lo comprueba (12 en cuadro).
  Rendimiento 6v6: `EXTRA=format=6v6 node tools/perf.js …` (tope provisional de 45 llamadas de dibujo en baja, frente a 35 en 2v2, hasta
  fundir los atletas lejanos en el sprint 4).
- **6v6 con humano: cámara en 3ª persona (11-nov-2026, camera_input)**: `ctx.settings.cam6` = `'3p'` (por defecto) | `'tv'` (main.js `loadSettings`; ui.js: Ajustes · Imagen
  «Cámara en 6 contra 6» y, en la preparación del 6 contra 6, la fila «Cámara» en el sitio de Escenario, que se oculta). `?cam6=tv|3p` manda en pruebas (se lee al cargar).
  camera.js: planos `tp` (juego, detrás y por encima del jugador que llevas; si saca un compañero, detrás del sacador) y `tpPoint` (reacción tras el punto y cierre
  de set; `getShot()` lo da como `'point'`). Solo con `g.size === 6`, sin `g.watch` y con `g.ctrl`; espectador, tv6test y las escenas serve6/rally6/point6 siguen en `tv`.
  Escenas nuevas (`?debug=`): `tserve6 recv6 spike6 block6 point6h` (`&won=1`) `setend6`. `node tools/cam6test.js [WxH] [s] [semilla] [puntos]` (camera_input;
  `TOUCH=1`, `CAM6=tv`, `SHOTS=dir`) juega en vivo y comprueba jugador y balón en cuadro, suavidad, límites y cortes. `perf.js` con `EXTRA=format=6v6` mide ahora la
  3ª persona (autopilot sin `g.watch`); players.js `screenLod` (6v6): fuera de cuadro = lejano siempre; en el punto solo los 4 atletas en cuadro más cercanos llevan
  malla media y trazo (y < 15 % del alto = lejano); en el punto y el saque solo dan sombra los 3 más cercanos (calidad media).
- **6v6 con humano: sin movimientos solos (11-nov-2026, sim)**: el humano solo se mueve, salta y golpea con su entrada (se quitó `assist6`/`g.assist6`); el imán corto
  de `assistMove` solo actúa en 6v6 si el stick ya empuja (`il >= 0,2`; el 2v2 no cambia). `VB.AI6.spot(g, p)` = su sitio en la formación (fx.js lo marca con el aro
  celeste `posMark`); `g.hAct` = momento de su última entrada (`VB.AI6.setReady`: el colocador no le coloca si está quieto o lejos de la red).
  (detalle en notes/ui_main.md). Avanzan la sim (autopilot, semilla fija `&seed=N`)
  hasta el momento y congelan (`ctx.frozen`); `&live=1` sigue jugando. `&guide=1` fuerza los toques guiados del primer partido,
  `&hold=1` la celebración de victoria en depuración, `&prewarm=0|t|c|r` el modo de precalentado, `&diff=` el nivel. `&quality=low|medium|high` fuerza calidad.
  `&aq=1` activa la calidad adaptativa en depuración (`&aqwarm=s` cambia los 8 s de calentamiento); `dive` admite `&team=0|1|any`, `&n=N`, `&t=s` (por defecto plancha PROPIA del
  jugador no controlado delante de la cámara, congelada 0,22 s tras el contacto; sin candidata en 30 min, la primera de la CPU; `&team=` = criterio anterior).
  `&maxdt=0.25` permite dt grande en entornos lentos (SwiftShader va a ~1-5 fps; con GPU real headless va a 100+ fps).
  Las escenas congeladas envejecen los efectos del evento que las dispara (main.js `fxAge`) para que el destello no salga a plena intensidad.
- Los errores de módulos los registra main.js como `console.error('[VB][ERROR] Modulo.funcion: ...')` (máx. 3 por sitio) sin romper el bucle.
- `node tools/camtest.js [s=75] [semillas] [tamaños]` (de camera_input; SPEED=2, PAR=4, LOG=1, ONLY=…, STRICT=0, PAGE_ROOT=carpeta, DIFF=nivel): regresión automática de la cámara
  en vivo (bounds, cuts, cutcount, servecut, nextcut, settle, mono, reverse, hero agregado por tamaño, scorer, bbox, ball, fovrate). Escribe solo en `tools/out/camtest/`.
- Las herramientas de DevTools (`tools/cdp.js`) crean un perfil temporal `vb3c-*` en %TEMP% y lo borran al cerrar (síncrono, 5 reintentos, y otra vez tras el `exit` de Chrome);
  al abrir barren los de más de 1 h (`VB_NOSWEEP=1` lo desactiva). `VB_PROFDEBUG=1` informa.
  `cdp.js` exporta `killOrphans(maxAgeMs, dry)`: cierra (`taskkill /T /F`) los Chrome huérfanos cuyo proceso Y carpeta `vb3c-*` tienen más de 1 h; `sweepProfiles` lo llama si un perfil viejo no se deja borrar o una vez por hora (marca `%TEMP%/vb3-orphans.stamp`).
  `node tools/clean.js` (ui_main; `DRY=1` solo lista, `AGE=min`) lo hace a mano.
  `cdp.js` exporta además `sweepDead(deadMs = 8 min, dry)` (borra las carpetas `vb3c-*` de más de `deadMs` que ningún proceso vivo nombra en su línea de órdenes; si no se puede
  listar, no borra nada; `open()` lo llama como mucho cada 2 min, marca `%TEMP%/vb3-dead.stamp`, al momento con ≥ 4) y `listVbProcs()`; `clean.js` acepta `DEAD=min`.
- Parámetros nuevos (ola 2): `&intro=0|1` (tarjeta de presentación; en depuración solo con `&intro=1`), `&stamp=1` (sello de calidad también con autopilot), `&vig=0` (sin viñeta CSS), `&wipe=0` (sin cortinilla), `&camdbg=1`. `tools/cdp.js` `page.frames(ms, {dir, start})` (fotogramas reales del compositor) y `VB_ROOT=carpeta`; `perf.js` `EXTRA=params`. camtest añade follow, fovpump, wide, spiker y cutaway.
- Parámetros nuevos (arreglos ola 2): `&preboot=0`, `&bootcap=ms`, `&gymintro=0`, `&camyaw=rad` (depuración: gira la cámara tras su update). `node tools/offarrow.js` (UI-10, escena `?debug=spike&camyaw=±1.2`).
  camtest: `fovpump` es la puerta de p95 ≤ 12°/s y balón fuera de cuadro 0; `fovpumpX` (p50 ≤ 2°/s y balón tras el HUD) y `spikerAll` (agregado CAM-13) son informativas salvo con `STRICT2=1`.
  simtest: bandas de la matriz con `MATRIX_STAT` (objetivo ± 3,5·sd/√(semillas × min/20)); las 6 casillas de banda estrecha juegan el doble de semillas. `perf.js` repite `startMatch` cada 0,5 s hasta `'playing'` (arranque lento).
- Ola 3: camtest añade `serve`, `board`, `clutter`, `block` en cada partida y partidas aparte `[menu]` (`menu` + `intro`), `[setend]` (`clinch`) y `[feel]` (hit-stop y punch);
  `EXTRA_JOBS=` las quita, `CAMBREAK=` fuerza una rotura y `node tools/camtest.js selftest` comprueba que cada `&camBreak=` hace fallar su comprobación. `tools/padplay.js` acepta
  `PADID="…"` (p. ej. DualSense → glifos ✕/○). `tools/audiotest.js` añade las partes 2d/2e/6 y `--endui-only`, `--no-endui`, `--w3-only`, `--sweep-only`, `--no-w3`, `--no-sweep`.
  simtest: sección de calibración del highlight (20 partidos completos de demo, también en el modo rápido) y comprobación de determinismo.
- Arreglos ola 3: simtest falla si la IA (equipo CPU, demo, autopilot o compañero IA del humano; no el jugador que controla el humano) comete un punto `double`/`four`.
  camtest: `feel` descuenta un frame lento del PC dentro de la congelación y `wide` ignora los frames a ≤ 0,4 s de un tirón del PC (lo indican); `serve` en pantalla
  baja/táctil admite el sacador en x ≥ −0,02 NDC.
- **Sprint 2-4 (15-nov-2026):** pruebas nuevas `node tools/recaptest.js`, `retotest.js` (con su parte CDP en el scratchpad de T19),
  `lifetest.js`, `worldtest.js`, `proftest.js`, `synctest.js`, `contacttest.js [s] [semillas] [mapas] [2v2|6v6]`, `replaytest.js`
  (`--node` | `--cdp`) y `portraittest` (sondas de T14). Escenas: `debug=intro` (`&kind=mini|short|long&career=1&boss=<estilo>&duel=1&t=`),
  `recap` (`&career=1&move=±n&boss=1&chem=1&cup=semi|final&unl=n&tab=sum|stats`), `retos` (`&tab=hoy|maestria`), `reto_end`,
  `replay` (`&rpt=s&match=1&auto=1&career=1`), `best` (`&tab=plays&play=1`), `menupf` y `prof` (`&tab=vestuario|insignias|entreno|carrera|
  retos|sedes|hitos`; `&pfseed=demo` = perfil de prueba en memoria, nada se guarda). En cualquier escena: `&boss=<estilo>`, `&mate=<estilo>`,
  `&retodate=AAAAMMDD`, `&uianim=0`, `&slow=0.5`, `&replay=1` (graba también con autopilot). Todas en `tools/shot.js ALL`.

- Capturas y logs en `tools/out/`.

## 7. Terminología (castellano, árbitro FCVB)
saque, recepción, colocación, remate, bloqueo, toque, red, fuera, antena, dobles, 4 toques, set, punto de set,
punto de partido, cambio de saque. El bloqueo no cuenta como toque del equipo. Sets a 25 (3º a 15) con 2 de diferencia.
Arte y nombres originales; marcas de las vallas ficticias (NÓRDIKA, VOLTA, ALBA·SPORT, MARINA FM, TERRA, SALT·9; pabellón "PALAU DEL MAR").

### VB.TOON (sprint cartoon, integración 9-nov-2026)
- Lo crea arena.js al cargar: `{ gradientMap (DataTexture de 3 pasos, NEAREST), ink 0x1d1530, shadow 0x2b2547, enabled, rank, px, toonMat(p), outline(mesh, m, opts), drop(o), setQuality(q), frame(cam, h) }`.
- `outline(mesh, m, opts)`: casco invertido hijo de `mesh` (Mesh, SkinnedMesh o InstancedMesh). Grosor = min(opts.max, max(m, px · opts.k de pantalla)); si la
  geometría trae el atributo `ow` (0..1) se usa como peso por vértice. Nunca devuelve null: en calidad baja queda oculto (`userData.inkRank` 1 = desde media,
  2 = solo alta; `userData.inkOn = false` lo apaga). `drop(o)` lo quita de la lista (players, al reconstruir los atletas).
- Un solo gradientMap y una sola tinta para atletas, pabellón y mobiliario. El balón (fx.js) usa el mismo gradientMap y su propio contorno de ~2 px.

### Pulido 10-nov-2026 (controles PC, dorsales, Control, separadores, pantallas grandes, playa)
- **Teclas (input.js; textos de ui.js salen de la tabla `GLYPH`):** moverse WASD/flechas; golpear y sacar **J** o **X** o **clic izquierdo**; saltar (en el
  aire: dejada) **Espacio** o **rueda**; colocar **K** o **clic derecho** (acción `jset`; desde el 16-nov-2026, C2: en el suelo coloca en tu 2º toque y si no salta, ver notes/sim.md «Colocar por destino»); C cambiar jugador; V challenge; P/Esc pausa; M sonido; Intro aceptar;
  F pantalla completa. Espacio ya no golpea. El clic entra en el mismo mapa que las teclas (ids `Mouse0`/`Mouse2`: mantener = hitHeld/jumpHeld), solo con
  `pointerType 'mouse'`, solo en `playing`, nunca sobre `MOUSE_UI` (botones, paneles, overlay táctil) ni con los controles táctiles a la vista.
- **Dorsales:** tu pareja lleva el **1** y el **2** (`createGame`: `mkPlayer(0, 1, 0)`, `mkPlayer(0, 2, 1)`; CPU 3 y 9). `prog.js` renumera escuadrones
  guardados (7/11 → 1/2) sin perder progreso. Carrera: dorsal por defecto 1, compañero 2.
- **Control:** `ctrlMode` de dos valores ('both' \| 'one'); en 'one' siempre el n.º 1. La Carrera solo controla a tu jugador (v2: sin opción «Los dos»).
- **Separadores:** `VB.UI.sep(parts, kind, html)` (= `sepHTML` de ui.js; career-ui.js lo usa vía `sp()`): 'd' rombo (antetítulos), 'v' raya fina (ayudas de
  teclas, parciales, estadísticas), 's' barra inclinada (pares cortos), 'c' pastillas (datos de una opción). `parts` es array o texto con « · »; entre trozos
  va una coma `.sr` para lectores. Las frases van con puntuación normal, no con «·».
- **Escala de UI:** `--vs` en `#app` (ui.js `vpFit`): 1 hasta ~1280×760, 1,34 a 1920×1080, 1,71 a 2560×1440, tope 2; `.vs-up` con --vs > 1,05. Menú, Carrera
  (`.cr-in`) y tarjeta de presentación (`#intro .in-card`) usan `zoom: var(--vs)`; HUD y hojas usan `--hs` = Tamaño del HUD × --vs. Por debajo no cambia nada.
- **Escenario:** ajuste `arena` (arriba). `VB.Arena.venueName(id?)` da el nombre de la sede montada (o la de un id / tipo); ui.js cambia el nombre en los
  textos visibles (los que nombran varias sedes se dejan). La playa se construye al elegirla y se libera al volver (sin fugas); el pabellón solo se oculta. Ver notes/arena.md «Playa».
- **Sedes (mapas, 12-nov-2026).** Registro de datos `VB.VENUES` / `VB.Venues` en `js/venues.js` (sin THREE: `def(id)`, `kindOf(id)`, `list(kind)` = las
  disponibles, `valid(kind, v)`, `resolve(tipoOId, settings, seed)`). Sedes de hoy: pabellón `palau` (Palau del Mar), `canrebot` (Poliesportiu Can Rebot, de día) y `cupula` (Cúpula del Far, de noche); playa `platja` (Platja Llarga),
  `fanals` (Cala dels Fanals, de noche) y `moll` (Moll de la Sorra, en el puerto; día o tarde). Ajustes nuevos `mapHall` ('palau' | 'canrebot' | 'cupula' | 'rand') y `mapBeach` ('platja' | 'moll' | 'fanals' | 'rand'), validados en
  `loadSettings` contra el registro (lo desconocido vuelve a la sede de serie; los guardados viejos siguen valiendo). Ajustes · Imagen: «Pabellón»
  y «Sede de playa» (cada fila sale cuando hay más de una sede de su tipo); «Luz de playa» solo con sedes que la admiten (`lights`). `?map=` acepta un tipo (`hall`, `beach`) o un id
  (`?map=fanals`). **Lo único que va a la sim sigue siendo el tipo** (`VB.Arena.venue()` → 'hall' | 'beach'). Añadidos: `VB.Arena.map()` (id montado),
  `VB.Arena.maps()`, `VB.Arena.registerMap(def)` (lo llaman los `js/venue-<id>.js` al cargar), `VB.Arena.look()` → `{map, kind, night, sand}` (fx.js
  saca de `sand` el color de las partículas de arena), `landmarks.scoreBoard.map`. main.js `forceVenue(v)` acepta tipo o id (`onSettings` de arena con
  la copia de los ajustes y `forceMap`). Detalle en notes/arena.md «Sedes».

### TAJO y playa completa (10-nov-2026)
Identidad propia de los atletas (dirección «TAJO», lo contrario de otros juegos de vóley playa low-poly: cabezones de ~5 cabezas, superficies lisas,
contorno grueso DE COLOR, cara grande dibujada, uniforme de equipo con el «tajo») y la playa «Platja Llarga» como mapa principal.
- **Escenario (venue).** Una sola fuente: `VB.Arena.venue()` → `'hall' | 'beach'` (ajuste `arena` o `?map=beach`). main.js crea el partido con
  `venue: venueNow()`; el 6v6 juega siempre en el pabellón y la **Carrera siempre en la playa** (los dos con `forceVenue`, ver «Muñeco,
  Carrera de playa y compañeros» abajo); players y fx miran
  `VB.Arena.venue()` cada frame. Cambiar el escenario en la pausa se aplica al salir del partido.
- **Pista de la partida (`g.court`).** Todo lo que pinte, mida o encuadre la pista usa `g.HL` / `g.HW` (o `VB.Sim.court(g)`), nunca `C.HL/C.HW`:
  arena (cintas, red, postes, oficiales: `beachLayout(g)`), fx (línea de la revisión del challenge y atenuación del marcador de caída fuera:
  `courtHL(g)`/`courtHW(g)`), cámara (`lostBall`, punto de saque, revisión). `C.HL/C.HW` solo como respaldo sin partida.
- **Personajes por escenario.** `VB.Players.venue()` → escenario con el que están vestidos; `VB.Players.setVenue(v, g?)` lo fuerza (pruebas;
  `''` vuelve a seguir a arena). Al cambiar, players libera los atletas (atlas, material, geometrías, contorno con `VB.TOON.drop` y **textura de
  huesos del esqueleto**) y los reconstruye; la clave de caché incluye el escenario. Pabellón: manga, tajo en zigzag, rodilleras, calcetines de
  acento y zapatillas; playa: camiseta de tirantes, malla corta del mismo color, descalzos y visera/gorra hacia atrás (sin gafas de sol).
- **Cara dibujada.** Los huesos `eyes, mouth, teeth, brow[2]` siguen existiendo (27 huesos) pero **vacíos**: la cara va en dos láminas que
  muestrean la hoja de caras del atlas de cada atleta (8 celdas de ojos × 8 de boca, uniformes `uEyeOff`/`uMouthOff`). `VB.Players._face(p, x)`
  acepta además `'c<ojos>/<boca>'` (p. ej. `'c5/2'`). Pieles oscuras: halo claro en ojos, cejas y boca (legibilidad).
- **Tinta de color.** `VB.TOON.outline(mesh, m, { color })` acepta un color de contorno (un material por color, el mismo programa). Los
  atletas usan `mixHex(tc.dark, INK, 0.35)`; pabellón y mobiliario siguen con `INK`.
- **Oficiales.** arena escala el hueso de la cabeza de árbitros, jueces y anotadores (`OFF_HEAD_K` 1,32) y les da ojos de dibujo, para que no
  queden realistas al lado de los atletas.
- **Cambio de campo de playa** (`courtChange why:'swap'`): videomarcadores «CAMBIO DE CAMPO · CADA 7 PUNTOS», silbato corto pegado al del punto.
- Sim y `g.rng` no cambian: huella 2v2 idéntica (simtest).

### Colocación en salto (10-nov-2026)
- **Controles, el mismo concepto en todo**: en el aire, GOLPEAR = remate (o el toque que toque) y **COLOCAR = colocación en salto**; SALTAR otra
  vez sigue siendo la dejada. COLOCAR en el suelo (y en el saque) salta, así que pulsarlo dos veces = salta y coloca.
  Teclado **K** (antes alias oculto de saltar) · ratón **clic derecho** (`Mouse2`; desde C2, 16-nov-2026: la rueda, `Mouse1`, salta) · mando **X** (PS □; antes 2º botón de
  saltar, B sigue saltando) · táctil: botón contextual **COLOCAR** (verde, 64 px; 56/52 px en pantallas bajas) encima de SALTAR, solo en el aire con
  el balón jugable (`VB.Sim.jsetReady(g)`), se va al caer; deslizar de SALTAR a COLOCAR vale. `VB.Input.poll()` añade `jset` (flanco; con él
  `jump` también es true), `_debug().setOn`, `stats.press.set`, `stats.out.jset`, `stats.mouse.jset`; `glyphs().jset`. main.js pasa `simIn.jset`.
- **Sim**: `hit(..., shot 'jset')` (gesto del humano) en el 2º toque, o en el 1r con el balón alto en la red (`isAttackContact`): `kind 'set'`,
  `shot 'jump'`, `hit.jset`. Más tensa que la de suelo (cima = contacto + 0,75 m, mín. 4,1; 1r toque + 1,15), ventana ÷1,2 y `p.ak.wSet`;
  con mal timing (q < 0,45) a veces sale pegada a la red o larga. El remate que sigue a una buena tiene la defensa rival ×0,8 (`VB.JSET`).
  Donde no cabe (3r toque) COLOCAR es dejada en la red o el toque normal. Tras una colocación en salto en el 1r toque se ataca en el 2º:
  `VB.Sim.atkPhase(g, t)` sustituye a «touchTeam === t && touches === 2» (ai.js, hitWindow.attack, assistMove, aim3, aimPoint, focusPoint,
  updateDefense, players.js approachTime, fx.js retícula). `point.assist`/Manos de seda cuentan la colocación en salto. La IA no la usa: CPU contra
  CPU idéntico. Funciones nuevas: `VB.Sim.atkPhase`, `canJset(g,p,count)`, `jsetReady(g)`, `jsetVoid(g,p)`, `VB.JSET`; `stats.jsets`.
- **Arreglos tras la revisión (10-nov-2026)**: (1) el bloqueador CPU **lee** la colocación en salto: con `jsetReady` (humano en el aire en un
  toque donde puede colocar) va ya a la red frente al compañero del humano, sin saltar; si el humano arma GOLPEAR o dejada, salta a por él
  (ai.js `pos`; nunca en CPU contra CPU). (2) `JSET.dig` (×0,8) solo tras la del 2º toque. (3) `jsetReady` mira el contacto previsto
  (`hitWindow`): jugador aún > 0,25 m y, en el 1r toque, balón > NET_H + 0,1, lo mismo que pide `canJset`; caché por `g.time`.
  (4) `jsetVoid(g,p)`: con un remate rival en camino COLOCAR en el aire no hace nada (se bloquea) ni se ofrece. (5) COLOCAR pulsado
  justo al despegar se guarda `JSET.buf` (0,2 s, `g.jsetQ`): la doble pulsación rápida = salta y coloca.
- **UI**: aviso en el aire en rejilla 2×2 (`#prompt.two`): «[GOLPEAR] Rematar / [COLOCAR] Colocar» (táctil «… / [COLOCAR] en salto»,
  sin la línea de consejo repetida; teclado: J naranja y K verde); `GLYPH.*.jset/jsetT` (K, X/□, Colocar);
  `.key.tch.s` (verde); panel Controles, tutorial (paso 3) y consejos en los 3 dispositivos. Detalle en notes/sim.md, notes/camera_input.md y notes/ui_main.md.

### Muñeco, Carrera de playa y compañeros (10/11-nov-2026)
- **players.js con el muñeco.** El muñeco chibi de `js/doll.js` (`VB.Doll`, cargado justo después de players.js; players lo lee en init) es el ÚNICO modelo de personaje:
  `VB.Players.body()` → `'doll'` (los presets `?body=` ya no existen; `setBody` devuelve false). players.js monta el esqueleto de siempre
  (27 huesos) con `VB.Doll.dims()` / `VB.Doll.boneLayout()` y pide la geometría (`VB.Doll.geometry(r, lod)`, 3 niveles) y el material
  (`VB.Doll.material(tc, L, num, beach, px)`: atlas con equipación, dorsal y hoja de caras; caras con `VB.Doll.faceCells`). Las poses siguen
  en el espacio del atleta antiguo y `applyPose` las reproyecta (`ARM_K`, `ARM_UPK`, `LEG_K`); estirón cartoon del brazo en la IK hasta
  `ARM_STRETCH` 1,405 (`VB.Players.dims()`: `reach` 1,935 de reposo, `reachMax` 2,192 como antes). Aspecto por jugador (`lookOf`: tus n.º 1
  y 2 fijos, el resto determinista por dorsal/equipo/club rival), equipaciones de `setKit`, playa con tirantes, malla y descalzo. La sim no
  cambia: huella 2v2 idéntica. Los oficiales y el público (arena.js) siguen con su estilo propio. Detalle en notes/players.md «Muñeco».
- **Escenario forzado** (main.js): `forceVenue(v)` monta el escenario `v` como si fuera el ajuste (`onSettings(copia con arena v, 'arena')` a
  todos los módulos, sin tocar `ctx.settings`) y `unforceVenue()` (en `toMenu`) vuelve al del ajuste (si se cambió en la pausa, manda el ajuste).
  La **Carrera** (`startMatch` con `opts.career`) fuerza `'beach'`; el **6v6** (`?format=6v6`: partido, demo del menú y escenas serve6/rally6/
  point6) fuerza `'hall'`, porque la sim juega en su pista 18×9.
- **Carrera de vóley playa** (`voley3d.career` v3; v1/v2 migran sin perder nada): `matchSetup()` → `venue: 'beach'`, `points: 21` (3r a 15),
  clubes de playa con `club.beach` (sede), circuitos Regional / Nacional / Superliga de Playa / Continental / Mundial y el Open. `quickSim` también
  a 21/15. Detalle en notes/carrera.md «Sprint playa».
- **Compañeros**: media = media del club + desvío propio (`VB.Career.MATE_OFF` −9..+5, media −2), rol complementario, `mateProfile(m)`, forma
  `m.form` −3..+3; las ofertas traen su compañero (`o.mateP`); la plantilla (`c.squad`, `genSquad`) da 2 alternativas dentro de `MATE_OFF`, a ≥ 3
  del titular y distintas entre sí; `changeMate(i)`. El club renueva al compañero si queda a `MATE_RENEW` (7) o más bajo el club.
- **Precompilado asíncrono** (main.js `prewarmPrograms`): al devolver `getUniforms` a los programas recién compilados, los materiales afectados se
  marcan con `currentProgram = undefined`, `uniformsList = null` **y `__version = -1`** (sin esto, three r149 reutilizaba el programa
  indefinido tras cambiar la calidad y el partido se pintaba vacío con «reading 'getUniforms'» en cada frame).
- `tools/perf.js` sin `EXTRA` mide el escenario por defecto (la PLAYA); el pabellón se mide con `EXTRA=map=hall`.

### Carrera de pista 6v6 y ligas reales (lote C, 11-nov-2026)
- **Dos Carreras guardadas aparte.** `VB.Career` es una fachada sobre dos motores con las mismas claves (`VB.Career.beach`, `VB.Career.hall`):
  `create({mode:'beach'|'hall', name, num, pos, country, points, seed})`, `mode()`, `setMode(m)`, `has(m)`; el resto de claves van a la activa.
  `matchDone(r, st, g)` va al motor de `g.career.mode`. La de playa no cambia (guardado, migración y API). Pista: `voley3d.career6` (v1,
  `mode:'hall'`); dañado → `voley3d.career6.bak` y la activa vuelve a la playa.
- **`matchSetup()` de pista** → `{format:'6v6', venue:'hall', ctrlRole, ctrlIdx, nums, attrs, difficulty, ref, kit, rivalKit, career}`; `kit` y
  `rivalKit` llevan `kitLibero` (color del líbero del club, que usa `Players.setKit`). main.js `startCareerMatch`
  pasa `format`, `ctrlRole` y `nums`, y el escenario sale de `m.venue`.
- **`VB.Leagues`** (js/leagues.js, se carga antes de career.js en index.html, careertest y simtest): `{provisional:false, regions:[{region,
  countries:[{country, code, tier, divisions:[{lvl, name, short, strength, clubs:[{name, short, city, gender, colors:{shirt, shirt2, libero},
  liberoEstimated, ovr}]}]}], competitions:[{name, short, kind:'intl'|'cup'|'skip', rank?, zone?, country?}]}], add(region)}`. 28 países, 37 ligas,
  390 clubes; nombres y abreviaturas únicos en todo el juego; sin nombres reales ni oficiales (están en notes/clubes/*.json y en la lista de
  revisión notes/clubes-reales.md). `gender` es un dato interno: ningún texto del juego lo enseña.
- **IA de la pista** por la media del club rival (`VB.Career.hall.DIFF_AT` / `SOFT`): < 56 Fácil, 56-61 Normal suave, 62-75 Normal, 76-87
  Difícil, ≥ 88 Experto. Es la base Normal: la dificultad de la Carrera (15-nov-2026) la mueve con `hall.rivalAI(c, k)`.
- **Dificultad de la Carrera de pista** (15-nov-2026): mismas claves que la playa en `VB.Career.hall` (`CDIFF, CDIFF_KEYS, STEPS, DIFF_MSG,
  diffOf, rivalAI, attrOf, baseStep, seasonDiff, midNota, setDifficulty`) y `GATE6`, `TOP6` (87), `top(c, k)`. `create({mode:'hall', diff})`;
  `next()` añade `ovrClub`, `ovrSim`, `cdiff`; `matchSetup()` añade `cdiff` (también en `career.cdiff`) y sube los atributos del seis y del
  banquillo rival con `attr`. Guardado `voley3d.career6` sin subir VER6 (`saneDiff6`: lo que falta es Normal). Detalle en notes/carrera.md.
- Regla de datos: para cambiar un club o una competición se corrige el JSON de `notes/clubes/` y se ejecuta `node tools/build-leagues.js`
  (comprueba unicidad, colores, patrocinadores conocidos y «masculino/femenino» antes de escribir). `tools/careertest.js` falla si js/leagues.js
  no está al día con los JSON.

### Vestuario: personalización del aspecto (rama personaliza, 13-nov-2026)
Todo es estético: nada entra en la sim, en `attrs`, en `badges` ni en `g.rng` (huella 2v2 idéntica); cero programas y cero llamadas de
dibujo nuevas en partido (todo va en la malla y el atlas del muñeco). Detalle en notes/players.md (muñeco) y notes/ui_main.md (resto).
- **`VB.Look`** (js/look.js, ui_main): `V, SLOTS, CATALOG [{id, name, slot, venue:'P'|'Y'|'A', rarity:0..3, unlock:[…], geo, tris, hint}],
  CLASH, STYLES, SKINS, HAIRS, PALETTE`, `item(id), name(id), stars(id), lockText(id, hall)`, `defaults(i), sane(fit, i), fix(fit, venue,
  slot) → {fit, removed}, ok(fit, venue)`, `resolve(fit, venue, tc)` → L congelado (sin `h`: la altura la pone players), `geoSig, atlasSig,
  sig`, `fromSeed(n)`, `random(seed, ownedOnly)` (semilla de la UI = `Date.now()`, nunca `g.rng`), `load(), fit(i), setFit(i, fit),
  owned(id), grant(id, src), wearable(fit, saved), unseen(), markSeen(ids), checkGlobal({gym, gymN, rec})`, `matchLooks(o)` y
  `mergeRaw(Lraw, Rraw)`. Fit: `{v:1, skin, hair (hex o id de tinte), style, hall:{ranura:id}, beach:{ranura:id}, colors:{acc, acc2,
  sock, shoe, glass}}`.
- **`VB.Look.matchLooks(o)`** → `[fit0|null, fit1|null]`, con `o = {career, hall, look, mate, watch}`: Partido rápido 2v2, Entrenamiento y
  demo `{}` → `[fits[0], fits[1]]`; 6v6 rápido `{}` (players solo viste a tu atleta, el de `ctrlBase`); 6v6 espectador `{watch:true}` →
  `[null, null]`; Carrera de playa → `[o.look || fits[0], fromSeed(hash del compañero)]`; Carrera de pista → `[o.look, null]` (`null` en
  guardados antiguos: la cara de siempre).
- **main.js**: guarda `curLooks` (= `matchLooks` del partido en curso) en `setGame(g, kit, lookOpts)` y lo pasa a
  `Players.setKit(Object.assign({}, kit || settings, {looks: curLooks}))`; también en Ajustes › Equipación. En la Carrera,
  `lookOpts = {career:true, hall, look: VB.CareerLife.lookNow(), mate: m.career.mate}`. `ctx.actions.showroom(on, L, o)`: con `on` llama a
  `VB.Doll.preview.start(ctx, L, o)` (o a `set` si ya estaba encendida), a `Players.showroom(true)` y para la sim de la demo; sin `on`,
  `stop()` y `Players.showroom(false)`; `ctx.noteHitch()` al empezar, al acabar y cuando `set` devuelve `'geo'`. Solo en el estado
  `'menu'` (setState la apaga fuera de él). En el bucle, `VB.Doll.preview.update(realDt)` va DESPUÉS de `CameraRig.update` (coloca
  `ctx.camera`). `o.px` por defecto: 1 en táctil, 2 en escritorio con calidad alta (como los atletas).
- **players** (js/players.js): `setKit(st, g)` con `st.looks = [fit|null, fit|null]` (aplica), `null` (borra) o `undefined` (conserva lo
  que había); la firma de los looks entra en la de `setKit` (pasa por `flushCache`). `kit(team)`, `kitFrom(st)` (tc desde un objeto de
  ajustes), `showroom(on)`, `lookOf6Id()`. Tu look solo lo lleva quien tiene `meSlot(p) >= 0` (equipo 0: idx 0/1 sin rol; con rol, el
  `ctrlBase` del 6v6 humano; nunca el líbero que entra por ti ni nadie en espectador); al cambiar `ctrlBase`, `swapMe` rehace solo los 2 rigs.
- **doll** (js/doll.js): `VB.Doll.material(tc, L, num, beach, px)` y `geometry(r, lod)` con `r.look` = L; lo que falte en L vale lo de hoy.
  `VB.Doll.preview = {start(ctx, L, o), set(L, o) → 'atlas'|'geo'|'', pose(name), face(expr), spin(dRad), yaw(rad), frame(name),
  place(cx, half) (centro del muñeco en fracción del ancho y, opcional, medio hueco libre; ui.js lo pone en el hueco libre), update(dt), stop(), active(), info()}`, `VB.Doll.HIDE_HAIR`, `VB.Doll.lookSelfTest()` (navegador).
- **ui** (js/ui.js, index.html): página `#mpLook` (`menuGo('look', o)`; `VB.UI.openLook(o)` con `{who, hall, tc, back}` o, para
  `?debug=look`, `{tab, venue, item, pick}`). Guarda con `VB.Look.setFit` o `VB.CareerLife.setLook` y llama a `ctx.actions.looksChanged()`.
- **Carrera** (career-life.js): `initLook(c), lookCheck(c, quiet), lookShop(c), buyLook(id) → 'ok'|'money'|'owned'|'', setLook(fit),
  lookNow(), achName(id, hall)`. La tienda del Vestuario no toca `GEAR`, `gearBonus`, `attrs`, `l.spent` ni el logro `gear`.
- **account.js**: `LOOK_SYNC = true` (15-nov-2026): `DOCS['voley3d.look'] = 'look'` y `merge()` une con `mergeLook` (own y seen con
  `VB.Look.mergeRaw`; fits del lado más reciente por la hora de meta; sin look.js gana entero el más reciente). Ya apunta la hora de cada
  escritura de `voley3d.look` aunque no suba. `VB.Account._mergeLook` y `_lookSync` (pruebas).
- **Depuración**: `?debug=look&tab=pelo|cabeza|cara|cuerpo|brazos|piernas|colores&venue=hall|beach&item=<id>&pick=1|2|career` (main.js
  abre el menú y llama a `VB.UI.openLook({tab, venue, item, pick})`; `pick` llega como 1, 2 o `'career'`, `venue` también acepta
  pista/playa); `&looktest=1` para `node tools/looktest.js --gl`.
### Sesiones de entrenamiento de la Carrera (13-nov-2026; playa y pista)
- **API (VB.Career, en los dos motores; la fachada va a la activa):** `trainInfo(c?)` → `{max:3, used, left, can, why:''|'none'|'done'|'fatiga',
  fat, fatMax:80, nextFat, fatK, imp, last, drills:[{id, name, short, help, attr, attrName, group, medals, v, prog}], need:100}`;
  `trainSession(id, 'quick'|'play', total?)` → `{ok, id, how, total, medal, q, gain, attr, prog, need, up, v, fat0, fat, imp0, imp, coach0, coach,
  n, max, s, wk}` (pista: `stat0, stat, sel, gap` del seis tras la sesión) o `{ok:false, why}`; `drillSetup(id)` → `{id, mode, n, max, attrs:
  [[tú, compañero], null], badges, kit, attrName}` o null; `drillDone(mode, id, total)` (fachada: a la Carrera del ejercicio). Constantes
  `TRAIN_SESS, SESS_NEED, SESS_MAX, SESS_EFF, SESS_FAT, SESS_FAT_MAX, SESS_QUICK, SESS_IMP_A, SESS_IMP_DECAY, SESS_COACH, SESS_DRILL, SESS_BY`;
  pista: `hall.meEdge(c, season?)`, `ME_EDGE` (12), `ME_EDGE_STEP` (2), `ME_EDGE_MIN` (4), `SEL_IMP` (4); `lineup(c)` añade `imp` y `edge`.
- **main.js:** `ctx.actions.startCareerDrill(id, auto)` (career-ui «Jugar») → `startMatch({drill, careerDrill: drillSetup})`: el ejercicio con tu
  jugador de Carrera y la equipación del club, `g.careerDrill = {id, mode, n, max, attrName, done, res}`; en `drillEnd`, `careerDrillDone(g)` apunta
  la sesión una vez; `toMenu()` vuelve al hub (`CareerUI.open('hub', {train:true, res})`). Abandonar o reiniciar a medias no gasta la sesión.
- **ui.js:** con `g.careerDrill` la hoja final no llama a `VB.Gym.record` (ni `voley3d.gym` ni XP del escuadrón), enseña progreso, fatiga e
  impresión, oculta «Repetir» y «Siguiente» y «Entrenamiento» pasa a «Volver a la Carrera» (también en la pausa).
- **Guardado:** `c.ts = {n, wk, imp, cf, tot, p:{serve, recv, set, spike, block}, last}` en `voley3d.career` y `voley3d.career6` (sin subir VER ni
  VER6; un guardado sin él o dañado se sanea al cargar con `sessSane`).
- **Sprint 2-4 (fusión 15-nov-2026):** `c.ts.md = [sin, bronce, plata, oro]` (sesiones por medalla, `sessSane` lo crea; logros `ses10` y
  `sesg5` de career-life.js) y gancho de vida `life(c, 'sess', res)` en la PRIMERA sesión de la carrera (`c.ts.tot === 1`): career-world.js
  dispara la escena `ses1` de Faro («El primer entreno»). Sustituye al módulo aparte del sprint (career-train.js), que se quitó.

**Online, 1.5.x (net, 16-nov-2026; detalle en notes/net.md «Lobby rediseñado…», «Fase 5», «Robustez y privacidad» y «Revisión final»).**
- `js/netconfig.js` (nuevo; `index.html` lo carga antes de `js/netrtc.js`) → `VB.NET_ICE = null` por defecto. Con servidores TURN
  (`{turn:[{urls, username, credential}], relayOnly}`; credenciales temporales servidas desde fuera, nunca fijas en el repositorio) `js/netrtc.js` negocia en
  `iceTransportPolicy: 'relay'`. `VB.NetRtc.relayOn()` (¿se usará TURN en la próxima conexión?), `VB.NetRtc._pcConfig()` (pruebas)
  y `_relayReset()`; si una conexión por TURN no abre, la siguiente va en directo.
- `js/net.js`: `session.result.unverified = true` cuando al final ninguna huella cuadró o hay una distinta sin reparar.
- `js/netrec.js`: `outcome` → `{kind:'unverified'}` («no válido», no suma ni a ganados ni a perdidos); `VB.NetRec.resume()` hereda
  la marca de partido de la página anterior (vuelta tras recargar). `end()` devuelve `{rec, entry, cap, outcome}`.
- `js/netlobby.js`: vuelta del INVITADO tras recargar (`sessionStorage` `voley3d.online.back`, < 50 s, misma cuenta, sala en
  'full'/'play' con ese invitado; sin direcciones de red); si se apunta la vuelta, `pagehide` no suelta el hueco. Lobby rediseñado
  (barra de acciones + cartelera) y teclado en pantalla con mando.
- `js/main.js`: `view.netCr.col` (colores de camiseta de los dos lados para el marcador colgado de `js/arena.js`, que pone «TÚ» y el
  nombre del rival) y `netMastery` (maestría de la hoja online, solo de los eventos confirmados de tu jugador). `ctx.net.recRes` =
  lo que devolvió `NetRec.end`.
- `js/ui.js` (toques): pista «↑↓←→ elegir» en la página Online y aviso «No válido…» en el resumen de la hoja final online.

- Auditoría (17-nov-2026), `js/net.js`: `Session({expect: {even, bestOf, points, venue}})` (invitado: si el saludo trae otras opciones →
  `result.why = 'mismatch'`); `resync` con `id`, repetido cada 1,5 s hasta el `rsok` del otro; `stats.rsIn` / `rsT` (resync aplicado y su
  tic); `CONNECT_CAP_MS` = 60 s de tope en 'connecting'. `js/netroom.js`: `list()` por latido (`orderBy seen`), `byCode` rechaza con
  `.code 'dup'` si hay más de una sala viva con ese código.

**Online, fase 6 (net, 17-nov-2026; notes/net.md «Fase 6»): vuelta del ANFITRIÓN tras recargar.**
- `js/net.js`: `new Session({slot: 0, opts: null})` = anfitrión que vuelve (`session.adopt`): saluda con `{k:'hello', back:1}`, toma
  las opciones del invitado, mide el reloj y, tras su `ready`, ADOPTA la partida confirmada que le manda el invitado (`resync` del
  invitado: la autoridad de la instantánea pasa al invitado solo en este caso). Plazo `ADOPT_MS` = 40 s sin noticias → `noShow`.
  Invitado ya juzgado (`goneFlag`, más de 60 s) → contesta `bye 'gone'`. `session.back` (lo pone el lobby en las dos vueltas;
  se borra al empezar o al aplicar el resync) y `session.hostBack` (invitado: el anfitrión ha vuelto). El mensaje `resync` lleva
  además `se` (época de «seguir contra la IA» de quien lo manda). Invitado que siguió contra la IA y ve volver al anfitrión a
  tiempo: vuelve a contar (`valid`), salvo `invalid` de reparaciones.
- `js/netroom.js`: `rooms.resume()` → `Promise<sala|null>`: la página nueva del anfitrión retoma SU sala (latido y señalización).
- `js/netlobby.js`: `pagehide` del anfitrión en partido (`playing`/`waiting`, con invitado) NO borra la sala y apunta la vuelta
  (`voley3d.online.back` con `role:'host'`, `guest`); al volver en < 50 s: `rooms.resume`, latido, sesión adoptante y `relink()`
  (oferta gen+1 al mismo invitado). Fuera de plazo: borra su sala. `ctx.net.base` se rellena con las opciones adoptadas (revancha).
- `js/main.js` (una línea del HUD): «Volviendo al partido…» mientras `session.back` y la sesión se conecta.
- `firebase/firestore.rules`: sin cambios.

**Online, fase 6 (net, 17-nov-2026; notes/net.md «Fase 6 — lobby terminado»): «Crear sala», vertical y ayuda.** Solo `js/netlobby.js`.
- `VB.NetLobby` no cambia de API. `voley3d.netroom` (última configuración de sala, por aparato) guarda además `pts` (11|15|21|25;
  por defecto 21) y la sala se abre con ese `pts` en Pabellón (en la playa, siempre 21). Las reglas ya lo admitían: sin cambios.
- Clases nuevas del lobby (CSS en la cadena del propio fichero): `.ol-mk` (rótulo de «Crear sala»), `.mk-prev` + `.ol-fx.fx-prev`
  (vista previa, no enfocable), `.ol-sel` (selector compacto con `data-ol`; ←→ por `NetLobby.side`), `dl.hp-box` («Cómo funciona»).
- (arreglos de la revisión) Sin cambios de API. `?net=bc` sin `&map=`: el anfitrión manda ya un `mapId` concreto (de
  `VB.Venues.list(venue)` con la semilla). La lista `d.pl` que ui.js pasa a `VB.Recap.endModel` va con tu equipo primero (orden estable),
  así un empate a puntos da el MVP a tu equipo también en el invitado.
