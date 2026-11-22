# Pendientes de Ferran: decisiones provisionales y preguntas (sprint «único», rama pendientes)

Lo que Ferran no respondió (o respondió a medias) se ha hecho con la **propuesta por defecto de la ficha** y queda aquí como
**decisión provisional**: cambiarlo es tocar el sitio que se indica. Lo que Ferran sí decidió está en la memoria
(make-the-cut-ideas-unico) y en las notas de cada idea; aquí no se repite.

Índice: Backlog del 21-nov · Señas · Xaranga · Semana · Rencor · Árbitros · Scouting · Cámara · Pruebas · Interruptores · Antes de
publicar · Chat rápido (30 frases para marcar) · «El Corte» · Preguntas abiertas de TRASPASO. Todo esto va en la versión 1.21.0 de la
rama pendientes, sin publicar.

## Imprescindibles 1.22.0 (rama investigacion; informe estudios/revision-juegos-voley-2026-11-21.md §4)
- **Revisión de la rama (22-nov).** Arreglos hechos sin preguntar: una llave de más en el CSS del táctil dejaba muerta la regla de zurdos
  de `.vt-zone`; la fila Duración de Partido rápido lleva su «?» en el móvil (allí la ayuda va oculta y no se veía «no cuenta para el
  récord»); «XP» y «experiencia» unificados («ni da experiencia»). **Decisión provisional: versión 1.22.0** (js/version.js y
  bridge/version.json) con su entrada de Novedades «A tu manera» (7 frases: Jugar ya, cortos, botones, marca, aro de caída, IA variada,
  Retomar). Es obligatoria antes de publicar: la IA variada cambia lo que simula cada lado y el lobby online y el sello de «Seguir el
  partido» separan por versión; con «1.21.0» en las dos, una copia vieja en caché y una nueva entrarían en la misma sala y se
  desincronizarían. Revisa los textos de las Novedades.
- **4.4 «Por qué falló cada toque»** (arreglo, no novedad; notes/ui_main.md «Por qué falló el toque»). **Decisión provisional:** la causa
  no sale por un orden fijo como decía el informe, sino por **la que más calidad le quitó** al toque (timing, lejos, balón muy rápido; mínimo
  0,1), y la **plancha va la primera**: en plancha el toque sale siempre flojo aunque el timing sea perfecto, decir «¡Tarde!» engañaría.
  «Pase flojo» solo cuando nada más pesa y el pase anterior de tu equipo fue malo (< `SETQ.lo`); en el 3r toque dice «Colocación floja».
  Toque flojo sin causa clara (atributos bajos, finta, defensa en el aire…): sin rótulo, como antes. Cambiarlo: `hitWhy` en js/sim.js y
  `WHY_TXT` en js/ui.js.
- **Arreglos de paso (informe §7; arreglos, no novedad).** Hechos sin preguntar: (1) el récord `rec('streak', N)` del catálogo de
  look.js dice ahora «Récord: N puntos seguidos en un partido» (antes «racha de N victorias», pero cuenta `record.bestStreak`, puntos
  seguidos; la clave y lo ya desbloqueado no cambian); (3) `toonSfx` y `onoma` ya están en `DEFAULTS()` de main.js y se guardan;
  (5) la nota de la tabla por jugador dice «Escala de valoración de scouting» en vez de la marca «Data Volley»; (6) la nota de K1/K2
  aclara que son fases del juego (side-out y contraataque), no llamadas del colocador.
  **Decisión provisional:** dos filas nuevas en Ajustes › Audio, «Sonidos de dibujo» (`toonSfx`) y «¡PAM!» (`onoma`), Sí/No, las dos
  en Sí por defecto. Si sobran botones, se quitan las dos filas de index.html (y sus `OPT` de ui.js); los ajustes se siguen guardando.
  **Decisión provisional:** no se añade una clave nueva de «racha de victorias» para el catálogo (el logro `s5` de la Carrera ya lo cubre).
- **4.3 «Jugar ya»** (notes/ui_main.md «Jugar ya»). Botón en la portada solo para quien no ha jugado nunca, `?jugar` en el enlace, aviso de
  instalar después del primer partido, «Y ahora» (Carrera, Vestuario, Cuenta) al acabar ese partido y tiempo hasta el primer punto guardado
  solo en el aparato (`VB.UI.firstPoint()`). **Decisiones provisionales:**
  1. El botón es un billete dorado «¡Jugar ya!» ENCIMA de JUGAR (en el sitio del de la Carrera), no sustituye a JUGAR; desaparece en cuanto
     se ha jugado **cualquier** partido (22-nov: antes miraba solo el récord del 2v2 largo y a quien jugaba 6v6, cortos, online o la
     situación de la semana le seguía saliendo «Primera vez»; ahora `record.anyMatch`, opcional, o partidos en el perfil). Lo mismo
     para el aviso de instalar, el tiempo hasta el primer punto y «Y ahora» (sale tras el primer partido de cualquier modo salvo
     Carrera, online y la situación de la semana). En el móvil, con él, la portada va sin logotipo (como con la Carrera: si no, la ayuda no cabe a 844×390).
  2. Partido «Jugar ya» = 2v2, un set a 15 contra la CPU (también en la playa), en Fácil para el novato (se queda en Ajustes, como «Primer
     partido»); la revancha de ese partido también es corta.
  3. `?jugar` vale para todos (no solo novatos): arranca el partido corto sin pasar por el menú y se quita del enlace.
  4. «Y ahora» sale una sola vez, al acabar el primer partido; Cuenta solo si no hay sesión.
  ¿Te vale el billete encima de JUGAR, o prefieres que JUGAR haga de «Jugar ya» la primera vez (un botón menos)?
- **4.2 «Botones táctiles movibles, con opacidad y modo zurdo»** (notes/camera_input.md «Disposición táctil»). Ajustes › Controles › Táctil ›
  «Disposición de botones»: editor a pantalla completa con los botones de verdad (arrastrar, Tamaño 70-150 % y Opacidad 30-100 % por botón,
  «Zurdos», «Restablecer», «Listo»). Solo en el aparato (`make-the-cut.device`), nunca en la cuenta. **Decisiones provisionales:**
  1. Se mueven GOLPEAR, SALTAR, COLOCAR y ⇄; la pausa y la lupa se quedan arriba a la derecha (también con «Zurdos») y un botón que se les
     echa encima se aparta. El joystick no se coloca (sigue saliendo donde pones el dedo): solo su opacidad.
  2. «Zurdos» pasa el joystick a la mitad DERECHA y refleja los botones (también los que hayas movido). «Restablecer» vuelve a lo de fábrica y
     deja «Zurdos» como esté.
  3. Cada cambio se guarda al momento (sin «Cancelar»: un botón menos). **Dos botones ya no pueden quedar uno encima de otro** (22-nov,
     revisión de la rama: con «Zurdos» y GOLPEAR movido, COLOCAR quedaba dentro de GOLPEAR y el toque iba al que no era): primero se
     colocan los que has movido y el que se les echa encima se aparta en línea recta (como con la pausa y la lupa).
  4. El editor se abre solo desde Controles (no hay atajo en la pausa del partido).
- **4.5 «Partidos cortos»** (notes/ui_main.md «Partidos cortos»). Fila «Duración» en Partido rápido: Completo / Un set / Final apretado,
  y el 7 en «Puntos por set». **Decisiones provisionales:**
  1. «Final apretado» empieza empatado a 5 del final de los puntos elegidos (25 → 20-20, 15 → 10-10; en la playa, a 21, el 16-16), no con
     dos opciones fijas «10-10 / 20-20»: una sola fila y un valor que dice desde dónde empieza («Desde 20-20»). Saca quien diga la semilla.
  2. Los cortos (un set, final, y también «Completo» con sets a 7) **no cuentan nada**: ni récord, ni retos, ni insignias, ni XP (escuadrón y
     perfil). No se llevan aparte. Quien solo juega cortos sigue siendo «novato» para la ayuda del primer partido.
  3. Dificultad deja de ocupar la fila entera para que quepa Duración sin una fila más (a 568×320 no cabía otra).
  4. Vale también en 6 contra 6. **«Jugar ya» (un set a 15) solo cuenta en el primer partido de quien no ha jugado nunca** (22-nov,
     revisión de la rama: antes contaba siempre y su revancha y `?jugar` daban victorias y XP baratas). La revancha de ese primer partido
     y `?jugar` de quien ya ha jugado son un corto más (`g.short` «Un set»): no cuentan y la hoja dice «Partido corto».
  ¿Prefieres que los cortos cuenten aparte (p. ej. su propio «ganados de jugados») en vez de no contar?
- **4.6 «Marca de tu jugador» y 4.7 «Indicador de caída»** (Ajustes › Accesibilidad; notes/ui_main.md «Marca de tu jugador e indicador de
  caída»). Solo visuales, sin tocar huellas. **Decisiones provisionales:**
  1. Alto contraste = **blanco con borde negro** (halo y galón); no amarillo, que es el color del aro de golpeo.
  2. «Se va retirando» = el aro de caída **sale solo en el último tramo del vuelo** (desde 0,8 s antes del bote) y la línea de altura a la
     mitad; no se va apagando con los partidos. Nunca se apaga solo: con «Auto» en Difícil/Experto pasa a «Se retira», no a «No».
  3. El aviso al cambiar de dificultad es una línea de 4 s en la ayuda de la fila Dificultad (no un cartel aparte); **en el móvil** (donde
     esa ayuda va oculta) sale además como aviso corto (toast) de 4 s (22-nov).
  5. **Partidas de antes (22-nov, revisión de la rama):** los ajustes guardados sin la clave `landAid` pasan a **«Siempre»** (el aro entero de
     siempre); «Auto» queda para los jugadores nuevos. Así a quien ya jugaba en Difícil/Experto no se le recorta sin avisar.
  6. **Aviso de una vez:** con «Auto», la primera vez que un partido (también de la Carrera, al subir a una división en Difícil) empieza
     en un nivel en el que el aro se retira, sale «En este nivel, el aro de caída sale solo al final del vuelo. Se cambia en Ajustes ›
     Accesibilidad» (7 s). Se apunta en el ajuste nuevo `laSeen`.
  4. La vista previa es un icono en la fila; a 568×320 no cabe y no sale.
  ¿Te vale que «Auto» retire el aro en Difícil y Experto, o lo quieres siempre entero salvo que lo cambie el jugador?
- **Preguntas del reglamento (informe §7, puntos 2 y 4; los textos NO se han tocado):**
  1. Falta de posición (`RULES.posicion` de js/senas.js): el texto dice «todos en su sitio de rotación», pero el juego **solo** la pita
     al equipo que recibe (regla 7.4, desde 1.11.0); la justificación del 21-nov (que también pita al que saca) es falsa. Propuesta:
     «Reglas 7.4-7.5: al saque, el equipo que recibe, cada uno en su sitio de rotación.» ¿La pones?
  2. Saque (`RULES.saque`): dice «se golpea con una mano»; la 12.4.1 dice «con una mano o cualquier parte del brazo». ¿Se corrige?
  3. Señas: la n.º 19 (red) también cubre el saque que toca la red y no pasa, y la n.º 12 es bloqueo o pantalla. ¿Ajustamos las
     explicaciones del Cuaderno a eso?

- **4.8 «IA que no repite el mismo ataque»** (notes/ia-variada.md). Memoria corta de la IA (`g.aiMem`): no remata ni saca a la misma
  zona tres veces seguidas, cambia de carril si los dos últimos remates fueron por el mismo, no saca tres veces seguidas al mismo receptor y
  en 6v6 el colocador reparte menos al que recibió las dos últimas. Sin azar nuevo (vale en el online). **Aviso de huellas:** cambian los
  destinos de la IA, así que `fp-2v2`, `fp-mastery` y `fp-salto` se han regenerado (y SIM_BASE de fluidsimtest). **Decisiones provisionales:**
  1. En **todas las dificultades** (no solo Difícil/Experto, la alternativa del informe).
  2. La IA solo varía **entre zonas casi tan buenas como la mejor** (`MEM.tol` = 0,6 m de hueco): con la penalización tal cual del informe
     Experto bajaba claramente; así sigue igual de duro (medido con los bots de simtest, tools/variedadtest.js).
  3. Si el jugador pide el balón en 6v6, al humano no se le reparte menos por haber rematado las dos últimas.
  4. **No hecho:** el bloqueo de la IA que se corre tras 4 remates tuyos seguidos por el mismo carril (fuera de la Carrera). Sigue solo
     «Te tienen estudiado» en la Carrera. ¿Lo quieres para otro sprint?
  5. **simtest recalibrado (22-nov, decisión provisional; antes quedaba con 4 fallos).** Con la IA variada la demo de 20 min cierra 1 set
     (~103 puntos) y da 36 % de remates que son punto; la calibración del highlight da 25,2 % de puntos grandes y 5,1 % ≥ 0,8 fuera de punto
     de set. Con 30 semillas la memoria no mueve los remates (37,4 % → 36,8 %): la banda del 51,5 % ya no encajaba con main desde el modelo
     de esfuerzo. Cambios en tools/simtest.js: centro de la banda de remates **0,37** (mismo ancho), la demo pide **un set cerrado** (no dos)
     y los topes del highlight **28 % / 6 %** (antes 25 / 5). simtest vuelve a TODO OK. Si prefieres los topes de antes, se vuelven a poner
     y se retoca HOLD en sim.js (eso movería huellas).
- **4.9 «Retomar el partido tras cerrar el navegador»** (js/resume.js, notes/resume.md). El Partido rápido se guarda al acabar cada punto
  (clave del aparato `make-the-cut.resume`, sellada con la versión) y la portada ofrece **«Seguir el partido 18-15 · 2º set»**; al tocarlo, el
  partido sigue exactamente igual (comprobado con la huella del estado en los saques siguientes). Sin huellas nuevas: no toca la sim.
  **Corregido el 22-nov (revisión de la rama):** antes aquí ponía «cerrar la pestaña nunca deja repetir un punto», y no era verdad: la foto
  es la de antes del saque con el mismo azar, así que cerrar a mitad de un peloteo y retomar dejaba repetir ese punto hasta ganarlo (y
  con él récord, racha, retos e insignias). Ver la decisión provisional 6. **Decisiones provisionales:**
  1. **La Carrera queda detrás de un interruptor apagado** (`VB.Resume.CAREER = false`; `?resumecareer=1` lo enciende para probar). Motivo:
     la nota en directo, las consignas del entrenador, el ambiente (su director con su propio azar) y los contadores de «Te tienen estudiado»
     viven en career.js con funciones dentro y no se pueden guardar todavía; retomar con ellos a cero daría notas y estadísticas de la
     jornada incompletas. En la Carrera todo sigue como antes (cerrar a mitad = el partido sigue pendiente en la jornada). Las pruebas de
     fichaje nunca se guardan: cerrar a mitad sigue suspendiéndola (tu decisión del 15-nov); tampoco la selección, las Estrellas, las cesiones…
  2. El billete «Seguir el partido» es **dorado, en el sitio de «¡Jugar ya!» / «Continuar carrera»** y, mientras hay un partido a medias,
     **tapa a los dos** (la Carrera sigue en Jugar → Carrera). No hay botón de «descartar» (un botón menos): empezar cualquier otro partido,
     o salir al menú desde la pausa, lo descarta.
  3. También se guardan los partidos cortos, «Jugar ya», el 6 contra 6 y el reto del día; **no** el online, el Entrenamiento, la situación de
     la semana (22-24) ni la demo.
  4. Al retomar sale la cinta **«Seguimos · 18-15 | 2º set»** y el partido sigue al momento (sin previa ni pausa). Si la versión del juego
     ha cambiado desde que se guardó, se descarta sin avisar (la partida podría no cuadrar con la sim nueva).
  5. Las mejores jugadas de antes de cerrar (pestaña «Jugadas») se pierden; la hoja final, la Estadística del partido, las insignias y los
     retos sí siguen la cuenta.
  6. **Cerrar con un punto en juego (22-nov).** En cuanto el punto se pone en juego (lanzamiento del saque o cualquier golpe), lo guardado
     se marca «punto en juego» (`live: 1`, la misma foto). Retomarlo se puede (si el sistema mata el navegador con la app en segundo plano
     no se pierde el partido), pero **ese partido ya no cuenta**: ni récord, ni racha, ni retos, ni insignias, ni XP (como los cortos).
     La cinta dice «Seguimos · 18-15 | 2º set · Se cerró con un punto en juego: ya no cuenta» y la hoja final lo repite. Cerrar en la
     pausa entre puntos o antes del saque sigue contando con normalidad. Alternativas descartadas por ahora: dar el punto al rival al
     retomar (habría que tocar la sim y el punto a medias) o no ofrecer retomar (se perdería el caso del móvil que mata la pestaña).
  ¿Quieres la Carrera también (habría que guardar la nota en directo y el ambiente: un sprint aparte), o te basta con el Partido rápido?
- **4.1 «Servidor TURN»** (notes/turn.md; pasos en turn-worker/README.md). **Preparado y APAGADO**: el Worker de Cloudflare está en
  `turn-worker/` sin desplegar, sin clave TURN creada y con `VB.NET_TURN_URL = ''`, así que el juego no hace ninguna petición nueva.
  **Lo tienes que hacer tú:** crear la clave TURN en Cloudflare Realtime, `npx wrangler@4 login`, `deploy`, los dos `secret put` y,
  cuando `curl https://turn.takethecourt.com/health` diga `ok`, poner la URL en js/netconfig.js. **Decisiones provisionales:**
  1. TURN **solo de respaldo** (policy `all`): no oculta tu dirección al rival (eso sería `relayOnly:true`, más ping y más tráfico de pago).
  2. Credenciales de **2 h**, pedidas al abrir/entrar en la sala y antes de cada oferta/respuesta, esperando **como mucho 2 s**; si no
     llegan, se juega con STUN como hasta ahora. Solo con sesión iniciada (el online ya la pide).
  3. Dominio `turn.takethecourt.com` (lo crea wrangler con `custom_domain`, sin tocar el DNS a mano); límite de 20 peticiones por minuto
     por cuenta **y otras 20 por IP** (22-nov: las cuentas se crean gratis, el uid solo no frenaba); orígenes permitidos: takethecourt.com,
     www, el puente de github.io y localhost:8080, y **sin cabecera Origin, 403** (antes pasaba con token).
  5. **Antes de desplegar, pon una alerta (o tope) de gasto de Realtime TURN en Cloudflare** (turn-worker/README.md, paso 1): aunque
     haya sesión, Origin y límites, alguien con muchas IP y cuentas nuevas podría usar el TURN de relé y lo que pase del tramo gratis se
     cobra. No hecho: exigir antigüedad de cuenta o sala online activa (el token no trae la fecha de alta; haría falta Firestore).
  4. El aviso de «No se ha podido conectar» no cambia de texto.

## Backlog del 21-nov (sedes, jefes de pista, repeticiones 6v6, torneo semanal y S4_SYNC; rama pendientes)
- **Sedes de la Carrera** (js/venues.js EMBLEM): Cúpula del Far en todas las finales de copa (también la nacional). **Decisión
  provisional: la «élite del 6v6» = rondas internacionales con un local de 1ª de fuerza ≥ 84** (la liga sigue en la sede del club, para
  no comerse las sedes generadas). **Decisión provisional: Can Rebot en la 2ª de cualquier país, el 25 % de las jornadas en casa** (y el
  debut); el resto, la sede del club. Solo cambia el mapa: ni la sim, ni la huella, ni el guardado.
- **Jefes en la Carrera de pista** (`BOSS_HALL = true`, career-life.js): uno por liga, en el club más fuerte de tu liga. **Decisión
  provisional: puestos Muro = central, Martillo = opuesto, Cañón = receptor y Pulpo = receptor** (la propuesta decía líbero, pero el
  líbero rival no sale de la Carrera y no se le pueden dar atributos de jefe). El jefe juega con su nombre y su dorsal.
- **Repeticiones en 6v6**: preparadas y APAGADAS (`REPLAY6 = false`, js/replay.js). La resimulación de partidos 6v6 enteros cuadra
  (desync 0), pero falta lo visual (los 12 jugadores en la repetición, la cámara 6v6, la pestaña «Jugadas» de la hoja 6v6) y medirlo en
  el móvil. **Decisión provisional: también automáticas en los puntos de set y de partido, como en el 2v2.**
- **Torneo de la semana**: **decisión provisional: cubierto por «El mismo 22-24»**; no se construye y `w`/`weeks` quedan solo como
  compatibilidad del guardado.
- **S4_SYNC = true** (account.js): perfil, Carrera de pista, modo de Carrera, Salón de la Fama y retos ya viajan con la cuenta. La semana
  sigue solo en el aparato. Antes de publicar: probarlo a mano con dos aparatos (conflicto «¿Qué Carrera de pista te quedas?»).
- Preguntas:
  1. Sedes: ¿Cúpula también en partidos de liga de élite? ¿Can Rebot en toda la 2ª, o el 25 % te vale?
  2. Jefes de pista: ¿te valen los puestos (Pulpo de receptor)?
  3. Repeticiones 6v6: ¿automáticas en los puntos de set y de partido, o solo desde «Jugadas»?
  4. ¿Confirmas que las reglas del 16-nov siguen desplegadas tal cual?

## Señas del árbitro y Cuaderno del árbitro (js/senas.js, notes/splat.md `.sp-sena`)
- **Decisión provisional: las 11 líneas de reglamento** del Cuaderno (`RULES` en js/senas.js, ≤ 80 caracteres). Dos corregidas el 21-nov:
  - «red»: «Regla 11.4.4: falta tocar la red entre las antenas al jugar el balón.» (antes decía también que el saque tiene que
    pasarla, pero eso es falta de saque, 12.6.2.1, y desde 2009 el saque que toca la red y pasa es bueno).
  - «posicion»: «Reglas 7.4-7.5: al golpe de saque, todos en su sitio de rotación, sin solaparse.» (antes decía «del equipo que
    recibe», y el juego la pita también al que saca).
- **Decisión provisional: pitido largo también en los cambios del 6v6.** El tiempo muerto solo existe en el online y viene apagado,
  así que casi nunca se oiría.
- **Decisión provisional: palabras largas en dos líneas** dentro de la pegatina («BAJO / LA RED», «8 / SEGUNDOS», «5 / SEGUNDOS»), sin
  abreviar.
- La seña se apunta en el Cuaderno al presentarse el punto, aunque luego un challenge anule la llamada.
- Preguntas:
  1. ¿Son correctas las 11 líneas de reglamento? ¿Te valen las dos correcciones?
  2. ¿Pitido largo en los cambios del 6v6, o solo en el tiempo muerto?
  3. ¿Palabras largas en dos líneas, o abreviadas (por ejemplo «8 SEG.»)?

## Xaranga (js/audio.js, notes/audio.md «Xaranga»)
- **Decisión provisional: nombre de la fila** «Xaranga», con «La charanga de la grada» debajo (Ajustes › Audio).
- **Decisión provisional: online** según la dificultad del partido que manda el anfitrión (Difícil/Experto suena; Normal no).
- **Decisión provisional: ensayos del menú apagados** (`XAR_WHEN.menu = false`): están hechos, pero no es un partido.
- **Decisión provisional: «partidos buenos» = Difícil y Experto** (`XAR_WHEN.diffs`).
- **Decisión provisional: el 22-24 semanal** suena según su nivel: las semanas que sale en Difícil (60 %) sí; en Normal, no.
- Falta escucharla con auriculares y en el altavoz del móvil antes de publicar.
- Preguntas:
  1. ¿Suena en el online? (ahora depende del nivel del anfitrión).
  2. En el 22-24 semanal, ¿siempre, nunca o según el nivel como ahora?
  3. ¿Quieres los ensayos de la charanga en los menús?
  4. ¿«Xaranga» o «Charanga»?

## La situación de la semana, «El mismo 22-24» (js/semana.js, js/semana-ui.js, notes/ui_main.md)
Ferran decidió: va JUNTO al reto del día y sin XP ni medallas. Lo demás es provisional:
- **Decisión provisional: igualdad** — nivel de la semana, atributos e insignias neutros, sin ayuda de novato, sin zona ni saque de
  firma (js/main.js `startMatch`, `sitO`). Los controles (Colocación dirigida, cambios del 6v6) siguen los Ajustes de cada uno.
- **Decisión provisional: intentos y mejor resultado solo en este aparato** (`make-the-cut.semana` no va a la cuenta).
- **Hecho según la propuesta que Ferran aceptó («JUNTO»)**: la situación ocupa el sello de la portada (junto a JUGAR, `js/menu-jugador.js
  semStamp`: el marcador, p. ej. «22-24», y los intentos de hoy en puntos; abre `VB.UI.openRetos('semana')`) y la 1ª pestaña de Retos; el reto
  del día sigue en la franja de Jugar (que abre Retos en la pestaña que recuerde, «Hoy» la primera vez) y en la pestaña Hoy. El sello
  lee con `VB.Semana.peek()`, que no cierra intentos abiertos en otra pestaña. Al montar el rediseño de menús hay que conservarlo.
- **Decisión provisional: el «3r set» empieza 1-1 sin parciales inventados**: el marcador enseña los pilotos 1-1 sin «S1 25-22 | S2
  22-25», y la hoja final solo el set jugado, rotulado «3r set».
- Al fusionar el cambio de nombre a Take the Court hay que cambiar dos cadenas: la base por defecto del enlace en `js/semana.js link()`
  ('https://purupurpito.github.io/make-the-cut/') y el `title` de `navigator.share` en `js/semana-ui.js share()`.
- El «torneo de la semana» del backlog (D1) se puede dar por cubierto con esto; `w`/`weeks` de retos.js y `{semana}` de VB.Look quedan
  sin usar (no se borran: compatibilidad del guardado).
- **Decisión provisional (revisión): en el sello de la portada los intentos de hoy salen como 3 puntos** (dorado = te queda, hueco =
  gastado), porque «Quedan 3» no cabía a 568x320. El texto entero va para los lectores de pantalla. Sin punto rojo de «nuevo».
- **Decisión provisional (revisión): las señas sí se apuntan en el Cuaderno al jugar la situación de la semana a mano.** No se apuntan
  en el online, el autopilot, el espectador ni las escenas de depuración.
- Preguntas:
  1. ¿Te vale la igualdad (nivel fijo, atributos neutros, sin ayuda de novato), o los novatos en Normal?
  2. ¿Intentos solo en el aparato, sin pasar por la cuenta?
  3. En el «3r set», ¿solo «1-1» (como ahora) o los dos primeros sets con resultados inventados?
  4. ¿Damos el «torneo de la semana» por cubierto y se tacha del backlog?

## Rencor y cariño de los clubes (js/career-life.js, notes/carrera.md «Rencor y cariño»)
Ferran decidió: con rencor fuerte el club te sigue ofreciendo fichar, pero en peores condiciones; solo rencor o cariño, nada más.
- **Decisión provisional: con «Ambiente de Carrera» apagado**, las ofertas y los mensajes siguen; solo se apaga la grada (la roja, que
  necesita el ambiente, solo puede salir con él encendido).
- **Decisión provisional: irse siendo transferible o porque el club incumplió su promesa de rol es neutro.**
- **Decisión provisional: el rencor leve (t −1) también rebaja el sueldo** (× 0,85); el fuerte, × 0,7 y un rol menos. El interés no baja.
  Si no lo quieres: `BOND_PAY[1] = 1` en career-life.js.
- **Decisión provisional: el enfriamiento se salta el primer verano** (lo de la temporada que acaba se mantiene entero un verano más).
- **Decisión provisional: la ficha de la oferta enseña el porcentaje** («Te ofrecen un 30 % menos de sueldo y un rol más bajo»).
- **Decisión provisional: una cesión no cuenta**, y un título con el club de la cesión da cariño a ese club.
- Preguntas:
  1. ¿El rencor leve también te hace ofertas peores (−15 %), o solo el fuerte?
  2. Con el ambiente apagado, ¿siguen las ofertas y los mensajes?
  3. ¿Irte transferible o por promesa incumplida, neutro?
  4. ¿Porcentaje en la ficha, o solo el motivo?
  5. ¿Que se enfríe ya el primer verano?

## Árbitros con nombre (js/career-world.js, js/arbitro.js, notes/ambiente.md «Árbitros con nombre y carácter»)
Ferran decidió: dos apellidos inventados; el lince y el nervioso afectan a las líneas solo en la Carrera.
- **Decisión provisional: la ficha «Frenar a [tu pareja]» también sale en la playa** (pregunta 2 sin respuesta; propuesta de la ficha).
  Solo en pista con brazalete: una condición en arbitro.js (`!st.hall ||` …).
- **Decisión provisional: factores de línea**: lince p1-p3 × 0,6 (falla un 40 % menos), nervioso × 1,3 en derbi.
- **Decisión provisional: para el nervioso cuentan como derbi** también el clásico y la final.
- **Decisión provisional: dos apellidos de aire español en todas las ligas, también las extranjeras** de la Carrera de pista: la
  pregunta de la ficha era para las ligas de España y Ferran no dijo nada de las demás. Hoy `panel()` (career-world.js) usa ARB_FN y
  ARB_R + ARB_S para todos los colegios sin mirar el país de la liga; el juego no tiene un generador de nombres por país (el de los
  jugadores mezcla países), así que cambiarlo pide hacer piezas por país.
- **Decisión provisional: frases de fama** en la previa: «fama de mano dura», «deja jugar», «ojo de lince», «los derbis le pesan», «de manual».
- Los apellidos se hacen con piezas (18 raíces × 12 finales); `ARB_NO` quita los que existen. Conviene que alguien repase la lista por si
  alguno coincide con un apellido real.
- Preguntas:
  1. ¿La ficha «Frenar» también en la playa?
  2. ¿Te valen los factores de las líneas (lince −40 %, nervioso +30 % en derbis, clásicos y finales)?
  3. ¿Te gustan las frases de fama?
  4. En las ligas extranjeras de la Carrera de pista, ¿los árbitros también con nombre y dos apellidos de aire español, o con nombres
     del país de la liga?

## «Te tienen estudiado» (scouting; js/sim.js g.scout, js/ai.js, js/career.js study*, notes/carrera.md)
Ferran decidió: empieza cuando tus notas mejoran y el rival va cambiando el plan.
- **Decisión provisional: «tus notas mejoran» = media ≥ 7** en tus 3 últimos partidos jugados (con al menos 2), no la tendencia.
- **Decisión provisional: el cambio de plan** salta con 3 puntos de remate por el carril abierto (y 2 más que por el cerrado); te cierra
  ese carril con fuerza ≥ 0,7 y avisa «Cambian el plan: te tapan la línea».
- **Decisión provisional: te estudian todos los rivales desde la 1ª temporada** si cumples la nota.
- **Decisión provisional: «por la línea»** en los textos (como las consignas), no «paralela».
- La defensa de la playa es muy sensible: `DEF_LEAN` 0,08 m y `BLK_SHIFT` 0,3 m (la ficha decía 0,9 y 0,45) están calibrados con bots.
  Conviene probarlo a mano.
- Preguntas:
  1. ¿Media ≥ 7 o que la nota suba?
  2. ¿Te vale el umbral del cambio de plan y el aviso?
  3. ¿Todos los rivales desde la 1ª temporada, o a partir de cierta liga?
  4. ¿«Línea» o «paralela»?

## Cámara (js/camera.js, tools/camtest.js, notes/camera_input.md «Zoom 1: la cumbre en la contención»)
- **Decisión provisional: con el zoom 1-2 en el móvil la cámara solo se echa atrás** cuando la cumbre del balón no cabría (colocaciones
  altas del 6v6). No gira ni cabecea por eso. El zoom normal (3) y los de lejos quedan exactamente como antes. Medido: el balón ya no se
  sale por arriba en tu propia colocación (antes, el 1 % de los frames).
- **Decisión provisional: la regla de «no perseguir balones muy rápidos»** (más de 15 m/s, o el balón que ya va a la grada) también
  cuenta en el 2v2 al medir la cámara en las pruebas. La cámara del juego no cambia por esto.
- Preguntas:
  1. **Juez de línea en tu saque**: con el balón en la mano, el juez cercano sale cortado por abajo (en pantallas anchas es una figura
     grande en primer plano) y la silla del 1r árbitro asoma por arriba. No hay un cambio pequeño de cámara que lo arregle sin bajar el
     campo rival. ¿Lo quieres entero, fuera de la imagen, o te vale cortado por abajo cuando está en primer plano?
  2. ¿Te vale que la cámara se eche atrás con el zoom 1 en las colocaciones altas?

## Pruebas (replaytest)
- **Decisión provisional:** la semilla de la prueba de repeticiones automáticas se calcula solo en pabellón, y los saltos de la
  repetición que pasan de 0,4 s se repiten una vez antes de darlos por malos (como otras pruebas con el PC cargado). No cambia nada del
  juego.

## Lo que queda detrás de un interruptor
- **Retomar el partido en la Carrera**: `CAREER` de js/resume.js (`VB.Resume.CAREER = false`; `?resumecareer=1` para probar). El Partido
  rápido sí se retoma (4.9).
- **Repeticiones en 6v6**: `REPLAY6 = false` en js/replay.js. Grabadas y resimuladas en las pruebas, sin pintar todavía (faltan los 12
  jugadores en la repetición, la cámara 6v6, la pestaña «Jugadas» de la hoja 6v6 y medirlo en el móvil).
- **Ensayos de la charanga en los menús**: `XAR_WHEN.menu = false` en js/audio.js (hechos, apagados).
- **Insignia «rompemanos» del jefe Muro**: sigue cortada (tiraría un dado más y cambiaría la huella).
- **Rencor leve con sueldo peor**: encendido; se apaga con `BOND_PAY[1] = 1` en js/career-life.js.
- **Ficha «Frenar a tu pareja» en la playa**: encendida; se limita a la pista con brazalete en js/arbitro.js.
- **Sello de la semana en la portada**: si faltan js/semana.js o js/semana-ui.js, vuelve el sello del reto del día.
- Encendidos en esta rama (antes apagados): `S4_SYNC = true` (js/account.js) y `BOSS_HALL = true` (js/career-life.js).
- Sin cambios aquí: el Acta del partido sigue oculta (solo tu cuenta).

## Antes de publicar (solo lo puede hacer una persona)
- Escuchar la Xaranga con auriculares y en el altavoz del móvil.
- Probar la cuenta con dos aparatos ahora que `S4_SYNC` está encendido (perfil, retos, Salón de la Fama y «¿Qué Carrera de pista te
  quedas?»). Mirar el tamaño de una Carrera de pista de 6-8 temporadas contra el tope de 390 000 caracteres. Confirmar que las reglas
  de Firestore del 16-nov siguen tal cual (el comentario de cabecera de firebase/firestore.rules todavía da «S4_SYNC = true» como
  pendiente; no se ha tocado).
- Un partido táctil de verdad provocando señas, y una Carrera de pista con un jefe y con un club con rencor.
- Repasar los apellidos de los árbitros por si alguno coincide con uno real.
- Al juntar esta rama con main: main ya va por la 1.20.0 (Take the Court) y esta rama sube a la 1.21.0 sin la 1.20.0, así que
  js/version.js chocará y hay que dejar las dos entradas. También hay que pasar a la marca nueva el enlace de `js/semana.js link()` y el
  título de compartir de `js/semana-ui.js share()`.

## Chat rápido: 30 frases propuestas (marca sí o no)
(★) = va en la rueda principal (8). (†) = pique sano: si quieres una beta «solo positivas», se quitan las (†) y quedan 24.
Todas tienen 28 caracteres o menos. El chat NO está construido: esto es solo para elegir las frases.

| # | Frase | Momento | ¿Sí? |
|---|---|---|---|
| 1 | ¡Hola! (★) | Saludo | [ ] sí [ ] no |
| 2 | ¡Suerte! (★) | Saludo | [ ] sí [ ] no |
| 3 | ¡Que gane el mejor! | Saludo | [ ] sí [ ] no |
| 4 | ¡A disfrutar! | Saludo | [ ] sí [ ] no |
| 5 | ¡Hoy no te dejo ni una! (†) | Saludo | [ ] sí [ ] no |
| 6 | ¡Vamos! (★) | Durante el partido | [ ] sí [ ] no |
| 7 | ¡Venga, que se puede! | Durante el partido | [ ] sí [ ] no |
| 8 | ¡Ahora verás mi saque! (†) | Durante el partido | [ ] sí [ ] no |
| 9 | ¡Estaba dentro! | Durante el partido | [ ] sí [ ] no |
| 10 | ¡Eso es red! | Durante el partido | [ ] sí [ ] no |
| 11 | ¡Challenge! (es broma) | Durante el partido | [ ] sí [ ] no |
| 12 | Tengo arena en los ojos (solo en playa) | Durante el partido | [ ] sí [ ] no |
| 13 | ¡Buen punto! (★) | Tras un punto | [ ] sí [ ] no |
| 14 | ¡Buen saque! | Tras un punto | [ ] sí [ ] no |
| 15 | ¡Qué defensa! | Tras un punto | [ ] sí [ ] no |
| 16 | ¡Vaya remate! | Tras un punto | [ ] sí [ ] no |
| 17 | ¡Qué recepción! | Tras un punto | [ ] sí [ ] no |
| 18 | ¡Bloqueo de libro! | Tras un punto | [ ] sí [ ] no |
| 19 | ¡Toma ya! (†) | Tras un punto | [ ] sí [ ] no |
| 20 | ¡Tocada! Lo vi yo (†) | Tras un punto | [ ] sí [ ] no |
| 21 | ¡Uy, por poco! (★) | Reacciones | [ ] sí [ ] no |
| 22 | ¡Perdón por la red! (★) | Reacciones | [ ] sí [ ] no |
| 23 | ¡Jajaja! | Reacciones | [ ] sí [ ] no |
| 24 | La red me tiene manía | Reacciones | [ ] sí [ ] no |
| 25 | ¡Eso es doble! (guiño arbitral) | Reacciones | [ ] sí [ ] no |
| 26 | Eso ha sido suerte… ¿no? (†) | Reacciones | [ ] sí [ ] no |
| 27 | ¡Buen partido! (★) | Final | [ ] sí [ ] no |
| 28 | ¿Otra? ¡Revancha! (★) | Final | [ ] sí [ ] no |
| 29 | ¡Choca esa! | Final | [ ] sí [ ] no |
| 30 | Te invito a un granizado | Final | [ ] sí [ ] no |

Cómo iría (resumen de la ficha): botón de chat al final de la pastilla del online, solo con el balón muerto; rueda con las 8 (★) y
«Más» con la lista entera; viaja solo el número de la frase; bocadillo de 2,5 s sobre el jugador; como mucho 1 frase cada 3 s y 3 por
punto; «Silenciar a X» para ese partido. Preguntas: ¿beta solo con frases positivas (sin las †)? ¿Te vale la tecla T en el PC?

## «El Corte» (la gran idea del sprint; sin construir, lo decides tú)
Cada bote a menos de 5 cm de la línea se convierte en un momento propio del juego:
- El juego se congela 0,7 s y una cortinilla de tinta parte la pantalla en diagonal: en una mitad, el juez de línea o el 1r árbitro con
  su seña; en la otra, la huella del bote con la cifra («DENTRO POR 2 CM»). Se salta con un toque.
- Si el árbitro falla, su mitad se mancha de rojo y el botón Challenge aparece ahí mismo.
- «Dejarla pasar»: en saques o remates rivales que van largos, un botón para no tocarla. Si bota fuera, «¡BIEN DEJADA!»; si bota
  dentro, te la comes delante de la grada. Es lo único que toca la simulación, y solo cuando se usa.
- «Mándalo al grupo»: tus amigos ven el último medio segundo, votan DENTRO o FUERA y luego ven lo que pitó el árbitro.
- Por qué: es el nombre del juego hecho imagen, sale en cualquier modo en los partidos igualados y aprovecha lo que ya existe (bote al
  centímetro, jueces de línea que fallan, challenge, la cortinilla). Tamaño medio en total.
- Preguntas: ¿se construye? ¿Entero o por partes (la presentación primero; «Dejarla pasar» y «Mándalo al grupo» después)? Con el
  cambio de nombre a Take the Court, ¿se sigue llamando «El Corte»?

## Preguntas abiertas de TRASPASO.md (siguen sin respuesta)
1. **Circuito Mundial**: los clubes de élite (media ≥ 80, IA Experto) no los gana nadie. ¿Reto final o se suaviza (`DIFF_AT`)?
2. **«Cerrar sesión»**: no borra el progreso del aparato (si se comparte el móvil, el siguiente lo ve). ¿Debe borrarlo?
3. **Tope de dibujos del 6v6**: en calidad baja se aceptan 45 (medido 37-39). ¿Se queda o se baja a 33 como el 2v2?
4. **Repo de redirección**: la dirección vieja /voley-3d/ da 404. ¿Se hace la redirección en purupurpito.github.io?
5. Música en ogg dentro de index.html o procedural; ¿moneda única o ninguna?; ¿el 6v6 visible en JUGAR?
6. Premios por nivel: ¿se quedan en 8 (había 17 propuestos)?
7. Dorsales «N.º 1 / N.º 2» en Jugadores: ¿se quedan así?
8. Recargar a mitad de partido o «Reiniciar partido» en la Carrera evita una derrota sin castigo: ¿es a propósito?
9. Torneo de la semana: ¿lo damos por cubierto con «El mismo 22-24»? (también arriba, en Backlog del 21-nov y en la Semana).
