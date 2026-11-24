# Pendientes de Ferran: decisiones provisionales y preguntas (sprint «único», rama pendientes)

Lo que Ferran no respondió (o respondió a medias) se ha hecho con la **propuesta por defecto de la ficha** y queda aquí como
**decisión provisional**: cambiarlo es tocar el sitio que se indica. Lo que Ferran sí decidió está en la memoria
(make-the-cut-ideas-unico) y en las notas de cada idea; aquí no se repite.

Índice: Imprescindibles 1.22.0 (rama investigacion: decisiones, TURN paso a paso, pruebas a mano, huellas) · Menús del 24-nov (rama decisiones) · IA del 24-nov (rama decisiones) · Repeticiones con botón (24-nov, rama decisiones) · Backlog del 21-nov · Señas · Xaranga · La jugada del día · Rencor · Árbitros · Scouting · Cámara · Pruebas · Interruptores · Antes de
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
  **Contestado el 24-nov** («Cuando alguien se meta al juego por PRIMERA VEZ que le dé de opciones Jugar ya o Tutorial»): ver «Menús:
  decisiones de Ferran del 24-nov», abajo.
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
  **Contestado el 24-nov** («Los partidos cortos son partidos sin más, sin traer experiencia ni nada»): se quedan así, sin contar nada
  (comprobado: `g.short` no da récord, retos, insignias ni XP; tools/cortostest.js).
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
- **Preguntas del reglamento (informe §7, puntos 2 y 4):**
  1. Falta de posición: **contestado el 24-nov** («En el reglamento ya sale que el equipo que saca es libre de ocupar la posición que
     quiera»): puesta la propuesta en `RULES.posicion`, **sin la primera coma** para caber en los 80 caracteres de senatest: «Reglas
     7.4-7.5: al saque el equipo que recibe, cada uno en su sitio de rotación.»
  2. Saque (`RULES.saque`): dice «se golpea con una mano»; la 12.4.1 dice «con una mano o cualquier parte del brazo». ¿Se corrige?
  3. Señas: la n.º 19 (red) también cubre el saque que toca la red y no pasa, y la n.º 12 es bloqueo o pantalla. ¿Ajustamos las
     explicaciones del Cuaderno a eso?

- **4.8 «IA que no repite el mismo ataque»** (notes/ia-variada.md). Memoria corta de la IA (`g.aiMem`): no remata ni saca a la misma
  zona tres veces seguidas, cambia de carril si los dos últimos remates fueron por el mismo, no saca tres veces seguidas al mismo receptor y
  en 6v6 el colocador reparte menos al que recibió las dos últimas. Sin azar nuevo (vale en el online). **Aviso de huellas:** cambian los
  destinos de la IA, así que `fp-2v2`, `fp-mastery` y `fp-salto` se han regenerado (y SIM_BASE de fluidsimtest, y la referencia
  «sin banquillo» de tools/subtest.js §1, rehecha en la pasada final del 22-nov: main 1.21.0 sigue dando las cifras viejas). **Decisiones provisionales:**
  1. En **todas las dificultades** (no solo Difícil/Experto, la alternativa del informe).
  2. La IA solo varía **entre zonas casi tan buenas como la mejor** (`MEM.tol` = 0,6 m de hueco): con la penalización tal cual del informe
     Experto bajaba claramente; así sigue igual de duro (medido con los bots de simtest, tools/variedadtest.js).
  3. Si el jugador pide el balón en 6v6, al humano no se le reparte menos por haber rematado las dos últimas.
  4. El bloqueo que se corre cuando repites carril: **hecho el 24-nov** («Te leen», rama decisiones; ver «IA: decisiones del 24-nov»).
  5. **simtest recalibrado (22-nov; antes quedaba con 4 fallos). Confirmado el mismo día** con 100 partidos completos de demo (5 grupos
     de 20 semillas, rama y main 1.21.0): puntos grandes 23,9 % en la rama y 21,8 % en main (grupos 22,4-25,2 y 20,9-22,8), ≥ 0,8 fuera de
     punto de set 5,0 % y 4,7 % (main ya pasaba del 5 % en un grupo), remates que son punto 36,4 % y 38,2 %, y los mismos puntos por partido
     (~105). La IA variada mueve 2 puntos los grandes y baja 2 los remates que son punto: no esconde una regresión; las bandas nuevas quedan
     con ~3σ de margen. Con la IA variada la demo de 20 min cierra 1 set
     (~103 puntos) y da 36 % de remates que son punto; la calibración del highlight da 25,2 % de puntos grandes y 5,1 % ≥ 0,8 fuera de punto
     de set. Con 30 semillas la memoria no mueve los remates (37,4 % → 36,8 %): la banda del 51,5 % ya no encajaba con main desde el modelo
     de esfuerzo. Cambios en tools/simtest.js: centro de la banda de remates **0,37** (mismo ancho), la demo pide **un set cerrado** (no dos)
     y los topes del highlight **28 % / 6 %** (antes 25 / 5). simtest vuelve a TODO OK. Si prefieres los topes de antes, se vuelven a poner
     y se retoca HOLD en sim.js (eso movería huellas).
  6. **fluidtest recalibrado (22-nov, pasada final). Confirmado el mismo día** con 30 partidos a RTT 250 (jit 20, pérdida 0/2/5, playa y
     pabellón, semillas 1-5) en la rama y en main 1.21.0: 8 recuperaciones > 300 ms en las dos, y main también llega a 2 en un lado
     (pabellón s2, 325 ms). Con el tope 1 la matriz ya fallaba en main. Con la IA variada los peloteos cambian y el escenario
     [4 rtt 250 jit 20 pérdida 2 playa s1] da 2 recuperaciones > 300 ms en un lado (máx. 316 ms) con tope 1; en main ya estaba en el
     borde (1, de 300 ms justos). La red no ha cambiado, solo hay más ocasiones. Tope a **2 por lado con RTT 250** (tools/fluidtest.js);
     con RTT < 250 sigue sin permitir ninguna. Si prefieres el tope 1, hay que mirar el tirón de recuperación en js/netfluid.js.
- **4.9 «Retomar el partido tras cerrar el navegador»** (js/resume.js, notes/resume.md). El Partido rápido se guarda al acabar cada punto
  (clave del aparato `make-the-cut.resume`, sellada con la versión) y la portada ofrece **«Seguir el partido 18-15 · 2º set»**; al tocarlo, el
  partido sigue exactamente igual (comprobado con la huella del estado en los saques siguientes). Sin huellas nuevas: no toca la sim.
  **Corregido el 22-nov (revisión de la rama):** antes aquí ponía «cerrar la pestaña nunca deja repetir un punto», y no era verdad: la foto
  es la de antes del saque con el mismo azar, así que cerrar a mitad de un peloteo y retomar dejaba repetir ese punto hasta ganarlo (y
  con él récord, racha, retos e insignias). Ver la decisión provisional 6. **Decisiones provisionales:**
  1. **Carrera: decidido por ti el 22-nov** («No quiero que sea posible ir reiniciando tu progreso constantemente en los partidos del
     modo carrera. Cada vez que se acabe un punto se guarda»). Hecho así (notes/resume.md «Carrera»): los partidos de la jornada (playa y
     pista) y los de la selección, las Estrellas y el juvenil se guardan al acabar cada punto (y desde el primer saque), con la nota en
     directo, las consignas, el ambiente y las estadísticas de la jornada; salir al menú guarda (en la pausa pone «Salir (se guarda)» y
     no hay «Reiniciar»), la Carrera queda bloqueada en ese partido hasta acabarlo (ni simular, ni pasar de jornada, ni empezarlo de cero);
     cerrar con el punto en juego = **ese punto es para el rival**; y si la foto no vale (versión nueva, otro aparato) el partido se acaba
     **simulado desde el marcador guardado**, nunca desde el 0-0. Las pruebas de fichaje siguen como decidiste el 15-nov (cerrar a mitad
     la suspende). Las Estrellas siguen castigando más al salir (se simula sin ti).
  2. El billete «Seguir el partido» es **dorado, en el sitio de «¡Jugar ya!» / «Continuar carrera»** y, mientras hay un partido a medias,
     **tapa a los dos** (la Carrera sigue en Jugar → Carrera). No hay botón de «descartar» (un botón menos): empezar cualquier otro partido,
     o salir al menú desde la pausa, lo descarta (en el Partido rápido; en la Carrera, no: ver 1).
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
- **TURN paso a paso (solo lo puedes hacer tú; detalle en turn-worker/README.md):**
  1. Cloudflare → Realtime → TURN Server → Create. Apunta el Turn Token ID y el API Token (este solo se ve una vez: al gestor de
     contraseñas o a ~/.secrets, nunca al repo). Pon ya una **alerta o tope de gasto** de Realtime TURN.
  2. En `turn-worker/`: `npx wrangler@4 login` (el token DNS que ya tienes no sirve para Workers).
  3. `npx wrangler@4 deploy --dry-run` y luego `npx wrangler@4 deploy` (crea turn.takethecourt.com con DNS y certificado). Si protesta
     por `[[ratelimits]]`, borra ese bloque y vuelve a desplegar: el límite sencillo ya cuenta por cuenta y por IP.
  4. `npx wrangler@4 secret put TURN_KEY_ID` y `npx wrangler@4 secret put TURN_KEY_API_TOKEN`.
  5. Comprobar: `curl https://turn.takethecourt.com/health` → `ok`; un POST sin token → 401; desde la consola del juego con sesión, el
     snippet del README → ttl 7200 y una lista de `turn:`/`turns:`.
  6. Encenderlo: `VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice'` en js/netconfig.js y publicar (antes se puede probar con
     `?netturn=…` servido desde localhost:8080). Hasta entonces no sale en las Novedades.
  7. A los pocos días, mirar en los informes de netlog cuántos partidos salen con type `relay`.
- **Para probar a mano en el móvil antes de publicar la 1.22.0:**
  1. Perfil nuevo (o ventana privada): portada con «¡Jugar ya!», un toque y primer punto; `takethecourt.com/?jugar` desde WhatsApp; al
     acabar, el bloque «Y ahora».
  2. Partido rápido › Duración: la «?» de la fila y un «Desde 20-20»; la hoja final dice «Partido corto».
  3. Ajustes › Controles › Táctil › «Disposición de botones»: mover GOLPEAR, tamaño, opacidad, «Zurdos» y jugar un punto (joystick a la
     derecha).
  4. Ajustes › Accesibilidad: marca grande + alto contraste en la playa y en el pabellón; un partido en Difícil con el aro en «Auto».
  5. Matar el navegador a mitad de partido (entre puntos y con el punto en juego) y volver con «Seguir el partido»: el segundo caso dice
     «ya no cuenta».
  6. Rótulos de toque flojo en partido y en el Entrenamiento de recepción («Balón muy rápido» es el más largo).
  7. Ajustes › Audio: apagar «¡PAM!» y comprobar que sigue apagado al recargar.
  8. Un partido en Experto (2v2 y playa) para ver si se nota la IA variada y si sigue igual de dura.
  9. Leer las Novedades «A tu manera» de js/version.js.
- **Avisos de huellas (solo IA variada, 4.8):** `tools/fp-2v2.json`, `fp-mastery.json` y `fp-salto.json` regenerados; SIM_BASE de
  fluidsimtest 74daeb88 (también la movieron, solo por el texto de sim.js, «Por qué falló» y los cortos); referencia §1 de
  tools/subtest.js rehecha. Cambian los destinos que elige la IA, **no** el azar: no hay llamadas nuevas a `g.rng` y el online sigue en
  lockstep (variedadtest: determinismo y copyGame a mitad con `g.aiMem`). Calibraciones tocadas: simtest (4.8.5) y fluidtest (4.8.6).
- **Estado de las pruebas en la pasada final (22-nov, de una en una):** TODO OK console.sh all (1280×720 y táctil 844×390, 44 escenas
  sin errores), simtest, fingerprint6 (2v2, maestría y salto), fluidsimtest, subtest, migtest, synctest, abouttest, replaytest,
  audiotest, hitwhytest, looktest, statstest, turntest, resumetest (node y navegador), csscheck, settest, jugaryatest, cortostest,
  a11ymarktest, touchedittest (844 y 568), touchtest, retotest, recaptest, badgetest, gymtest, padtest, drive, drive6 (arreglada en esta
  pasada), padplay, nettest, net3test, netreplaytest, netlogtest, roomtest, fluidtest (tope 4.8.6) y variedadtest. **Fallan igual en
  main 1.21.0** (comprobado en una copia aparte): viewtest («ritual.jug» sin clasificar en netview.js), touchplay a 667×375 (pestaña
  Equipación y deslizar en Ajustes) y camtest (16 fallos en las dos, sobre todo «serve» con el oficial cortado y «fovpump»; prueba
  inestable). Ninguno es de esta rama.
  **Arreglados el 22-nov (después):** viewtest (netview.js clasifica `ritual.jug`), touchplay (la prueba arrastra la columna de
  pestañas antes de tocar Equipación), camtest (sin tocar la cámara: los fallos conocidos —oficiales asomando en el saque, balón fuera en
  fovpump, cadera en wide, héroe por muestra— cuentan como «conocido» con tope medido; `CAMZERO=1` exige 0; ver notes/camera_input.md)
  y mobaudit (el informe del rival con carga de página propia). (La pregunta del juez de línea cercano en tu saque queda como decisión
  provisional en «Cámara», abajo: fuera de la imagen.)
  **Pasada de todas las pruebas de tools/ (22-nov, tarde, de una en una):** 86 en verde (los 72 *test*.js, las tres huellas, drive,
  drive6, padplay, touchplay, csscheck, console.sh 1280 y 844 táctil, mobaudit 568×320 y 844×390). animtest: huella neutra regenerada
  por la IA variada (comprobada en main y en el commit de la IA variada). **Fallan igual en main 1.21.0, sin tocar:** contacttest
  (holgura mano-balón en pass/dig, dive y forearm; main da 4 fallos) y balltest (pelota en la banda de las playas de día, nota 23-26
  con umbral 30; main igual). camtest «clutter» y la fila «home» de mobaudit a 844×390 fallaron una vez por tiempos y pasan solas.

## Menús: decisiones de Ferran del 24-nov (rama decisiones, sin versión)
Lo que pidió Ferran está hecho; aquí van las decisiones que he tomado yo al hacerlo (cambiarlas es tocar el sitio que se dice).
- **Primera vez** (js/ui.js `firstWanted`, `#menu.first-run`; billete `#btnStartTut` en index.html y js/menu-jugador.js). La portada de
  quien no ha jugado nunca es solo «¡Jugar ya!» y «Tutorial», con el logotipo encima también en el móvil. **Se acaba** al jugar cualquier
  partido (el mismo `everPlayed` de «Jugar ya») **o al cerrar el tutorial, se acabe o no** (`record.intro = 1`). Empezar un partido y
  salir a medias no la acaba. Después sale la portada de siempre, con el billete «¡Jugar ya!» encima hasta el primer partido (como en
  1.22.0). **Decisión (revisión):** en esa portada queda un engranaje pequeño de Ajustes (sin texto, abajo a la derecha encima de la
  versión) para quien necesite quitar el sonido o agrandar los botones táctiles; Cómo se juega y Controles no (el Tutorial ya lo enseña).
  El billete del Tutorial lleva «Aprende a jugar» encima (antes los dos ponían «Primera vez»). Quien ya acabó el tutorial antes (`record.tut`) no la ve. El panel «Primer partido» (tutorial o jugar ya, al pulsar ¡A jugar!)
  ya solo sale a quien no pasó por esa portada (p. ej. con una Carrera empezada y sin partidos). En depuración, `&first=1`.
- **6v6 en JUGAR** (index.html `#plFmt`, js/ui.js `plFmtSync`). Hoy el 6v6 ya estaba en Jugar, pero como una mancha más («6 contra 6»)
  al lado de Entrenamiento. Ahora el formato es una **opción** en la cabecera de Jugar, justo encima del Partido rápido: dos pestañas
  «2v2 | 6v6» (el ajuste «Formato» de siempre; el parche dice cuál). La mancha 6 contra 6 se ha quitado y **Partido rápido ya no
  vuelve a ponerte en 2v2** al entrar. La fila Formato de la preparación sigue (es la misma opción). Teclado y mando: ↑ desde Partido
  rápido llega al formato, ←/→ entre los dos, Intro/A lo elige y ↓ vuelve a Partido rápido.
- **Dorsales en el 2v2** (js/ui.js `sqRole`). En los menús tus dos jugadores van **por su papel** («Bloqueador», «Universal», de
  js/prog.js): selector de Jugadores (con la inicial en el disco), selector del Vestuario (en el móvil abreviado, «Bloq.» y «Univ.»;
  a 568×320 se esconde para ello el chip con el nombre de la pestaña, que ya va marcada en la tira de iconos), Controlar «Un jugador» («Llevas al bloqueador; la IA lleva al universal»), la línea de
  Jugadores de la portada («Nivel 3 los dos» / «Niveles 3 y 2») y la XP e insignias de la hoja final. **No cambia nada guardado**: el
  dorsal sigue en `VB.Prog` y en la camiseta, y en lo que pasa en la pista (consejos, MVP, cambios del 6v6) se sigue diciendo el número.
- **Rendimiento** (js/main.js `deviceGuess` / `autoStart`). «Auto» ya bajaba y subía con los fps medidos; ahora además **empieza** según
  el aparato: GPU por software, ≤ 2 GB o ≤ 2 núcleos (o móvil con ≤ 3 GB) → baja; GPU modesta (Mali-4xx/T6-8, Adreno 2xx-50x, PowerVR
  viejas, Intel HD 2000-5000) → un nivel menos; ≤ 4 GB o ≤ 4 núcleos → como mucho media; PC con pantalla 4K y ≤ 6 núcleos → media.
  Nunca empieza por encima del tope de siempre (alta en PC, media en móvil). En depuración no se aplica (las pruebas y perf.js no
  cambian). Ajustes › Imagen sigue con Auto / Alta / Media / Baja (la nota dice «Auto se ajusta sola a tu aparato (ahora: media)»).
- **Ventana del 1r 6v6** (js/ui.js `perfFirst` / `perfNote`, la misma hoja del aviso de colocador). Sale antes del primer partido 6v6
  de este aparato **que se empieza desde los menús**: ¡A jugar! del Partido rápido en 6 contra 6, «Jugar partido» de la Carrera de
  pista, la jugada del día y el reto del día cuando son 6v6, y el panel «Primer partido» con el formato en 6v6. Opciones: **Auto (recomendada, con el nivel en el que empezaría)**, Alta, Media y Baja; la de ahora dice «Ahora». Esc / B =
  dejarla como está. Debajo de Auto pone «Recomendada · se ajusta sola (ahora: media)». **Decisión:** si sale esta ventana, el aviso de
  colocador («Coloca con la diana») ya no sale detrás en esa sesión: nunca dos hojas seguidas antes del partido. Se apunta en `q6Asked` (solo este aparato, `make-the-cut.device`) elija lo que elija y el partido empieza al
  cerrarla. No sale en la revancha, al reiniciar, al retomar ni en el online. Recomiendo Auto y no un nivel fijo porque Auto ya
  empieza en lo que diga el aparato y se corrige con los fps; si prefieres que recomiende un nivel fijo, es `perfHTML` en js/ui.js.
- **Tope de dibujos del 6v6 en calidad baja: se queda en 45** (tools/perf.js `CALLS_LOW`). Bajarlo a 33-35 como el 2v2 obligaría a juntar
  mallas de los 12 jugadores (trabajo de render, no de menús) y lo medido (37-39) ya va holgado; el tope es una alarma, no un objetivo.
- **La jugada del día** (antes «El mismo 22-24»: diaria, con racha y ventana al entrar): sus decisiones van en su sección, más abajo.
- **Confirmado sin tocar**: «Cerrar sesión» no borra el progreso del aparato; el Circuito Mundial sigue como reto; los partidos cortos
  siguen sin dar XP ni nada.

## IA: decisiones de Ferran del 24-nov (rama decisiones, sin versión)
Ferran: «Quiero que la IA se adapte excepto en modo Fácil» y las reglas nuevas de «Te tienen estudiado». Hecho; lo que he decidido yo:
- **«Te leen»** (js/sim.js `RD` / `rdEv`, js/ai.js `readShift`, notes/ia-variada.md). **3 remates tuyos seguidos por el mismo carril**
  (desde un ala) y la CPU corre el bloqueo y se echa la defensa hacia ahí: a la 3ª con el 60 % de la fuerza, entera desde la 4ª. Un remate
  por el otro carril o por el centro lo corta. Fuerza por dificultad: **Fácil nada**, Normal 0,7, Difícil 0,85, Experto 1. Usa las
  mismas distancias que «Te tienen estudiado», con la defensa del 2v2 ×2,5 (con ×1 no se notaba). Aviso en pantalla: «Te han leído: te
  tapan la diagonal / la línea». Si ya te tienen estudiado por ese carril, no se suma (se queda lo más fuerte).
- **Dónde**: Partido rápido (2v2, 6v6 y playa), Carrera y online Precisa. **No en el online Fluida** (allí cada máquina solo ve los toques
  de su equipo; hacerlo obligaría a tocar netfluid.js, que es de la sesión del online) ni en Entrenamiento ni en la demo.
- **Medido con bots** (tools/studytest.js §8, bot que remata siempre en diagonal): playa Normal, en racha, los remates en diagonal que son
  punto bajan de 15,8 % a 12,6 %; pista 6v6 Normal ×0,7. En **Experto** ya se defiende casi todo y no se mide diferencia en los puntos
  (solo bloquea más): sigue igual de duro, no más blando. El bot que alterna línea y diagonal no la activa nunca.
- **Aviso de huellas**: regeneradas las de partido con humano (`tools/fp-2v2.json` human/attrs, `fp-mastery.json`, `fp-salto.json`) y
  SIM_BASE de fluidsimtest (`e052474f`), porque el bloqueo y la defensa se colocan distinto cuando el bot repite carril. Sin azar nuevo:
  la huella cpu (CPU contra CPU) sale idéntica; subtest y animtest no se han movido. simtest conoce el evento nuevo `read`.
- **«Te tienen estudiado»** (js/career.js `studyGate` / `studyMe`). Media ≥ 7 en tus 3 últimos (mín. 2) **o un partido de más de 9**
  entre esos 3 (un 9 justo no). Categorías: pista, la 1ª división de cada país y lo que se juegue desde ella; playa, la Hiperliga de Playa,
  el Continental y el Mundial. En la **2ª** (Hiperliga 2 y equivalentes; en la playa el Circuito Nacional) solo en las **finales** (copa de
  fin de temporada / Open) y en el **tramo final = último cuarto de la liga** (jornada > ¾ del total: de 14 jornadas, de la 11ª a la 14ª).
  En el Circuito Regional, nunca. El informe del rival dice por qué no te estudian y desde qué jornada lo harán. Los partidos de categorías
  sin estudio siguen contando para la nota (al subir ya te conocen). Se mantiene «por la línea».

## Backlog del 21-nov (sedes, jefes de pista, repeticiones 6v6, torneo semanal y S4_SYNC; rama pendientes)
- **Sedes de la Carrera** (js/venues.js EMBLEM): Cúpula del Far en todas las finales de copa (también la nacional). **Decisión
  provisional: la «élite del 6v6» = rondas internacionales con un local de 1ª de fuerza ≥ 84** (la liga sigue en la sede del club, para
  no comerse las sedes generadas). **Decisión provisional: Can Rebot en la 2ª de cualquier país, el 25 % de las jornadas en casa** (y el
  debut); el resto, la sede del club. Solo cambia el mapa: ni la sim, ni la huella, ni el guardado.
- **Jefes en la Carrera de pista** (`BOSS_HALL = true`, career-life.js): uno por liga, en el club más fuerte de tu liga. **Decisión
  provisional: puestos Muro = central, Martillo = opuesto, Cañón = receptor y Pulpo = receptor** (la propuesta decía líbero, pero el
  líbero rival no sale de la Carrera y no se le pueden dar atributos de jefe). El jefe juega con su nombre y su dorsal.
- **Repeticiones en 6v6**: ENCENDIDAS el 24-nov (rama decisiones; ver «Repeticiones con botón» más abajo). Con el mismo aviso que el 2v2.
- **Torneo de la semana**: **decisión provisional: cubierto por «La jugada del día»** (antes «El mismo 22-24»); no se construye y `w`/`weeks` quedan solo como
  compatibilidad del guardado.
- **S4_SYNC = true** (account.js): perfil, Carrera de pista, modo de Carrera, Salón de la Fama y retos ya viajan con la cuenta. La semana
  sigue solo en el aparato (la jugada del día y su racha también). Antes de publicar: probarlo a mano con dos aparatos (conflicto «¿Qué Carrera de pista te quedas?»).
- **Sedes y jefes: decididos** (Ferran, 24-nov: «Las sedes y jefes decídelo tú»). Se quedan como arriba: Cúpula del Far solo en finales
  de copa y rondas internacionales de élite (no en la liga), Can Rebot en el 25 % de las jornadas en casa de la 2ª, y los puestos de
  los jefes (Pulpo de receptor). Ya no son provisionales.
- Pregunta:
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
- **Decisión provisional: la jugada del día** (antes el 22-24 semanal) suena según su nivel: los días que sale en Difícil (60 %) sí; en Normal, no.
- Falta escucharla con auriculares y en el altavoz del móvil antes de publicar.
- Preguntas:
  1. ¿Suena en el online? (ahora depende del nivel del anfitrión).
  2. En la jugada del día, ¿siempre, nunca o según el nivel como ahora?
  3. ¿Quieres los ensayos de la charanga en los menús?
  4. ¿«Xaranga» o «Charanga»?

## La jugada del día (antes «El mismo 22-24» / situación de la semana; js/semana.js, js/semana-ui.js, notes/ui_main.md)
Ferran decidió: va JUNTO al reto del día y sin XP ni medallas. **24-nov:** «El 22-24 no tendría por qué ser siempre 22-24, puede ser algo
diferente cada día. Quiero que lleve un registro de cuántos días seguidos lo cumples, y que cuando entres al juego lo primero que te salga
sea un pop-up para completarlo.» Hecho así (rama decisiones, sin versión):
- **Diaria.** Cada día (fecha local, la misma para todos) sale una jugada de un catálogo de cinco tipos: «Salvar el set» (22-24, 23-24,
  21-24, 24-25), «La remontada» (18-23, 17-22, 19-23, 16-21), «El empujón» (22-23, 21-23, 20-22, 21-22), «Mano a mano» (24-24, 23-23,
  22-22, 25-25) y «Cerrarlo» (24-23, 24-22, 25-24, 23-22), escalados al set: a 25 en pista, a 21 en playa o el 3r set a 15. Más
  formato (2v2 pista 50 %, playa 30 %, 6v6 20 %), sede, saque y nivel. El objetivo siempre es **ganar el set** desde ese marcador, en una
  línea («Levanta el 22-24 y gana el set»). Todos los puntos valen lo mismo.
- **Racha:** días seguidos que la cumples (= la ganas en alguno de los 3 intentos de hoy), la actual y la mejor. Un día sin cumplirla y
  vuelve a 0. Sale en la ventana, en la pestaña (gota dorada con el número) y en el sello de la portada (chapa crema con el número; con
  la de hoy cumplida, una marca dorada en lugar de los puntos de intentos).
- **Ventana al entrar:** lo primero tras la carga, una hoja SPLAT con la jugada, la racha y «¡A por ella!» / «Ahora no».
- **Decisión provisional: nombre «La jugada del día»** (el «Reto del día» ya existe). La pestaña de Retos pasa de «Semana» a «Jugada» y,
  para no confundirlas, la del reto del día pasa de «Hoy» a «Reto» (Retos: «Jugada | Reto | Maestría»). El sello de la jugada (portada y
  pestaña) es verde azulado; el dorado queda para el reto del día. El sello de Retos en Jugar dice «RETOS» (antes «RETOS ★ RETO DEL DÍA»).
  La hoja final llama al bloque «Jugada del día» (antes «Situación»). Cambiarlo: textos en js/semana-ui.js, ui.js (previa, pausa, hoja, pestaña, ventana) y menu-jugador.js.
- **Decisión provisional: 3 intentos al día, como antes.** Si pierdes los tres, ese día no la cumples y mañana la racha empieza de cero
  («Me gusta que sea un reto»). Cambiarlo: `TRIES` en js/semana.js.
- **Decisión provisional: la racha solo en el aparato**, como los intentos (no va por S4_SYNC de account.js: habría que inventar cómo
  mezclar dos rachas de dos aparatos, y lo demás de la jugada tampoco viaja).
- **Decisión provisional: cuándo NO sale la ventana:** ya cumplida hoy o sin intentos; a quien no ha jugado nunca (ve «¡Jugar ya!» /
  «Tutorial»); con ?jugar o ?sem; con un partido a medias («Seguir el partido» manda, también el de la Carrera); con la Carrera, la Cuenta
  o el aviso de instalar abiertos; más de una vez por sesión (al recargar la pestaña no vuelve; al abrir el juego otro día o en otra
  pestaña, sí). Las Novedades de una versión nueva esperan a que la cierres; ese día el reto del día ya no se abre solo (si no sale la
  ventana, el reto del día se abre como siempre).
- **Decisión (revisión): una ventana detrás de otra, nunca encima.** Con la jugada abierta, la portada no cuenta como libre (ni el aviso de
  instalar, ni las Novedades, ni el online se abren encima); el aviso de instalar espera a que la jugada salga y se cierre. **Como mucho dos
  ventanas solas al entrar:** si ya han salido la jugada y el aviso de instalar, las Novedades esperan a la próxima visita. Si la jugada no
  llega a salir (te vas a jugar antes, o pasa 1 minuto sin portada libre), ya no sale después del partido y el reto del día recupera su turno.
- **Intento colgado:** si cierras la pestaña (o el móvil la mata) a mitad de un intento, ese intento cuenta como perdido, pero **la ventana
  vuelve a salir** al abrir el juego: la pestaña que juega da señal de vida cada 20 s y un intento sin señal en 75 s es de una pestaña
  muerta. Con otra pestaña jugando de verdad, no sale.
- **Decisión provisional: la jugada de cada día no se repite casi nunca** (dos días seguidos iguales: menos del 5 %), pero sí puede salir
  el mismo marcador otro día.
- El guardado `make-the-cut.semana` pasa a v2; el semanal se migra quedándose solo con tu nombre de jugador (su mejor era de otra
  situación). Los enlaces semanales viejos (?sem=AAAAWW…) avisan «Ese enlace es de la antigua situación de la semana».
- Sigue de antes: **igualdad** (nivel del día, atributos e insignias neutros, sin ayuda de novato, sin zona ni saque de firma; los
  controles siguen tus Ajustes); el «3r set» empieza 1-1 sin parciales inventados; las señas se apuntan en el Cuaderno al jugarla a mano;
  el enlace de compartir (?sem=…, desde takethecourt.com) con el «mapa del grupo», ahora por día.
- El «torneo de la semana» del backlog (D1) se da por cubierto con esto; `w`/`weeks` de retos.js y `{semana}` de VB.Look quedan sin usar.
- Preguntas:
  1. ¿Te vale el nombre «La jugada del día» (y «Jugada» en la pestaña)?
  2. ¿3 intentos al día, o sin límite mientras no la cumplas?
  3. ¿Te vale la igualdad (nivel fijo, atributos neutros, sin ayuda de novato), o los novatos en Normal?
  4. En el «3r set», ¿solo «1-1» (como ahora) o los dos primeros sets con resultados inventados?

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
- **Contestado (24-nov): «El rencor ya está bien».** Las decisiones de arriba se quedan tal cual; sin preguntas.

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
Ferran decidió: empieza cuando tus notas mejoran y el rival va cambiando el plan. El 24-nov: media ≥ 7 o un partido de más de 9, solo
desde la Hiperliga (y en la Hiperliga 2, finales y final de liga), y «por la línea» (ver «IA: decisiones del 24-nov»).
- **Decisión provisional: el cambio de plan** salta con 3 puntos de remate por el carril abierto (y 2 más que por el cerrado); te cierra
  ese carril con fuerza ≥ 0,7 y avisa «Cambian el plan: te tapan la línea».
- La defensa de la playa es muy sensible: `DEF_LEAN` 0,08 m y `BLK_SHIFT` 0,3 m (la ficha decía 0,9 y 0,45) están calibrados con bots.
  Conviene probarlo a mano.
- Pregunta: ¿te vale el umbral del cambio de plan y el aviso?

## Cámara (js/camera.js, tools/camtest.js, notes/camera_input.md «Zoom 1: la cumbre en la contención» y «Cámara fija en el saque»)
Sprint pedido por Ferran el 24-nov («en mi saque, la cámara se mueve demasiado»), rama decisiones, sin versión. Medido: en tu saque la
cámara recorría 0,4-2 m y giraba 9-28° por saque; ahora 0 en todos los tamaños, pista y playa, 2v2 y 6v6.
- **Decisión provisional: la cámara del saque se fija al empezar y no se mueve** en tu saque, en el vuelo de tu saque (hasta que el rival
  lo toca o bota) ni en el saque rival. Solo se mueve, suave y lo justo, si algo se iba a salir: el balón, tu jugador, el sacador o
  donde va a caer. Si mueves al sacador a lo ancho más de 1,2 m, la cámara se recoloca despacio y se vuelve a fijar. Cambiarlo: `FX` en
  js/camera.js (márgenes en `fxPoints`, recolocar en `fxApply`).
- **Decisión provisional: el encuadre de tu saque es más alto** (2 m más alto y algo más atrás, como la grúa que antes salía solo en el
  saque en salto). Así caben a la vez el campo rival, tu sacador y el lanzamiento más alto, y no hace falta mover nada. A cambio se ve
  más pista propia y tu sacador sale algo más pequeño. Cambiarlo: `SVFH` / `SVFB` en js/camera.js.
- **Decisión provisional: el vuelo se queda fijo solo con tu saque.** Si saca un compañero, la cámara va a por tu jugador durante el vuelo
  (como antes): hacerlo de golpe al primer toque rival era un movimiento muy rápido.
- **Decisión provisional: juez de línea cercano en tu saque, fuera de la imagen.** Con el encuadre nuevo queda fuera solo (y la silla del
  1r árbitro ya no asoma por arriba).
- No se ha tocado el resto del punto (peloteo): sigue la cámara de antes de 1.5.4 con la contención.
- **Decisión provisional: con el zoom 1-2 en el móvil la cámara solo se echa atrás** cuando la cumbre del balón no cabría (colocaciones
  altas del 6v6). No gira ni cabecea por eso. El zoom normal (3) y los de lejos quedan exactamente como antes. Medido: el balón ya no se
  sale por arriba en tu propia colocación (antes, el 1 % de los frames).
- **Decisión provisional: la regla de «no perseguir balones muy rápidos»** (más de 15 m/s, o el balón que ya va a la grada) también
  cuenta en el 2v2 al medir la cámara en las pruebas. La cámara del juego no cambia por esto.
- Preguntas:
  1. ¿Te vale que la cámara se eche atrás con el zoom 1 en las colocaciones altas?
  2. ¿Te gusta el encuadre más alto de tu saque, o prefieres el de antes (más cerca del sacador) aunque en el saque en salto la cámara
     tenga que abrirse un poco al lanzar?

## Repeticiones con botón (decisión de Ferran del 24-nov; js/replay.js, rama decisiones, sin versión)
Ferran: «la repetición con un botón por si quieres verla. En PC que sea "Pulsa V para ver la repetición", en móvil sale un pequeño botón
durante un tiempo corto». Ya no hay repetición automática.
- **Decisión provisional: el aviso dura 4 s** (`K.OFFER_T`). Se va antes si empieza el saque siguiente (la foto del saque se reutiliza) o
  si sales del partido. Si no lo pulsas, el partido sigue sin esperar.
- **Decisión provisional: qué puntos lo dan.** Los que antes daban repetición automática (cierres de set y de partido con ace, remate,
  dejada, bloqueo o un punto grande) y además los **puntos grandes** que no sean error (`highlight ≥ 0,65`, `K.OFFER_HL`): unos 8 por
  partido de 2v2 (1 de cada 11 puntos). Es de los dos equipos, como «Jugadas».
- **Decisión provisional: los botones.** PC: **V** (la tecla del challenge; si la cambias en Controles, el aviso dice la tuya). Mando:
  **LT** (L2 en PlayStation), el del challenge. No chocan: el aviso nunca sale cuando tú puedes pedir challenge (ni con el de la CPU
  pedido o una revisión en marcha). Antes, cualquier challenge posible cancelaba la automática y se perdían 5 de cada 8 puntos grandes;
  ahora, si solo la CPU podría pedirlo y no lo pide, el aviso sale. Táctil: botoncito SPLAT «REPETICIÓN» con ▶ (44 px de alto) donde va
  el botón del challenge, con una barra que se vacía.
- **Decisión provisional: el online no tiene aviso** (la repetición para la partida en vivo y rompería la sincronía). Al final siguen
  las «Jugadas», como antes.
- **Decisión provisional: con «Menos movimiento» el aviso sale igual** (la repetición la pides tú; sigue sin cámara lenta). Antes, la
  automática no salía.
- Ajustes › Juego › Repeticiones: «Automáticas» pasa a llamarse **«Con botón»** (mismo valor guardado `auto`, sin migración). «Al final»
  y «No» siguen igual.
- Si la pides con el saque siguiente esperando (fuera de la pausa del punto), el partido espera también mientras entra la repetición,
  para que la CPU no saque detrás de la cortinilla.
- **6v6 (REPLAY6 encendido).** Los 12 se pintan en la repetición (también si hubo un cambio o entró el líbero entre la jugada y ahora),
  con la cámara de tele; la hoja final 6v6 tiene «Jugadas». Medido con la CPU frenada ×4 a 844x390 (calidad media): la repetición va a
  58 fps y 14,6 ms de JS por frame, el partido en vivo a 49 fps y 15,5 ms; la preparación, como mucho 6 ms por frame (el avance rápido
  del 6v6 reparte un tercio de pasos por frame, `K6.PREP_DIV`). En el móvil de verdad no se ha medido: pruébalo a mano.

## Pruebas (replaytest)
- **Decisión provisional:** la semilla de la prueba de repeticiones automáticas se calcula solo en pabellón, y los saltos de la
  repetición que pasan de 0,4 s se repiten una vez antes de darlos por malos (como otras pruebas con el PC cargado). No cambia nada del
  juego.

## Lo que queda detrás de un interruptor
- **Retomar el partido en la Carrera**: `CAREER` de js/resume.js (`VB.Resume.CAREER = false`; `?resumecareer=1` para probar). El Partido
  rápido sí se retoma (4.9).
- **Repeticiones en 6v6**: encendidas el 24-nov (`REPLAY6 = true` en js/replay.js; se apagan poniéndolo a `false`).
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
punto; «Silenciar a X» para ese partido. En el PC, con la tecla T (Ferran, 24-nov: «La tecla T me sirve, sí»). Pregunta: ¿beta solo
con frases positivas (sin las †)?

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

## La moneda: salpis (decisión de Ferran del 24-nov: «La moneda que sea única, invéntatela»; rama decisiones, sin versión)
Lo que había: una sola cosa que se gasta, el dinero de la Carrera (`c.money`, en euros ficticios): se cobra con el sueldo, el
patrocinio, los premios de los retos y de las Estrellas, y se gasta en el material, los servicios, el fisio, el fisio intensivo de
las lesiones y la tienda del Vestuario (`shop` en js/look.js). Lo demás es progreso y no se ha tocado: XP y nivel (del atleta y del
perfil), fama y seguidores, puntos de mejora (`c.player.pts`), entreno (`c.tp`, se gasta solo al llenarse), química y logros.
Decisiones mías:
- **Nombre: «salpis»** (un salpi, de salpicadura). Corto, con gracia y de la familia de la tinta del estilo SPLAT. Si no te gusta,
  se cambia en un rato: está en las funciones `eur()` / `fmtEur()` de career-life, career-ui, career-injury, career-loan,
  career-allstar y look, en 4 mensajes de career.js y en `coinMsg` (career.js).
- **Icono**: una gota de tinta turquesa (el color del balón) con dos costuras de balón, contorno de tinta y una gotita al lado
  (`.sp-salpi` en index.html, SVG dibujado, sin marcas). Va delante de la cifra en Tienda (ahorros y botones de comprar), en los
  premios del último partido, en «Ahorros» del contrato y en el aviso de patrocinio del inicio de la Carrera. La palabra «salpis»
  se escribe siempre (el icono solo adorna y es aria-hidden).
- **Conversión 1 € = 1 salpi**: como solo había una moneda, no hay nada que unificar ni que perder. Los ahorros guardados no
  cambian de número. Los mensajes viejos de la bandeja con cifras en € se reescriben a salpis al cargar (`coinMsg`, idempotente;
  playa y pista). No hace falta tocar js/migrate.js (es el traspaso entre direcciones, no las versiones del guardado).
- **Sueldos también en salpis** (antes «Sueldo (ficticio)… en euros al mes»): una sola moneda en todo el juego. Fuera el
  «(ficticio)», que solo hacía falta por ser euros.
- **Cada Carrera guarda sus salpis** (playa y pista por separado, como hasta ahora). No hay monedero común ni salpis en Partido
  rápido: juntar las dos Carreras rompería el equilibrio de la que empieza, y ganar salpis fuera de la Carrera sería inventar
  una economía. Lo que compras en el Vestuario sí sigue siendo para siempre y para todo el juego.
- Nada de pagos reales ni de comprar con dinero; nada que haga que un punto valga más (el material sigue igual que antes).
- Pregunta: ¿te gusta «salpis» o prefieres otro nombre (gotas, manchas, tintas…)?

## Preguntas abiertas de TRASPASO.md (siguen sin respuesta)
(Contestadas el 24-nov y quitadas de aquí: Circuito Mundial = se queda como reto, sin suavizar `DIFF_AT`; «Cerrar sesión» no borra
el progreso del aparato, comprobado en js/account.js `signOut` —solo olvida la sesión y avisa «Tu progreso sigue en este dispositivo»—;
tope de dibujos del 6v6 lo decido yo, abajo en «Menús»; redirección de /voley-3d/: no se hace, «la de voley-3d no la conoce nadie
casi»; la moneda: ver «La moneda: salpis»; el 6v6 en JUGAR: ver «Menús».)
- **Decisión (24-nov, «La música como la veas mejor»): la música sigue procedural**, hecha por js/audio.js como ahora (y como la
  Xaranga). No pesa nada en index.html, funciona sin conexión y no hay que buscar ni licenciar ficheros ogg. No se toca nada.
6. **Premios por nivel** (Ferran pidió verlos). Hoy son 14, no 8: los objetos del Vestuario con nivel de perfil (`lv(n)` en js/look.js;
   cada uno también se puede comprar en la tienda). Nivel 2 Tira nasal · 4 Collar de conchas (playa) · 6 Malla larga · 8 Manguito de
   rayas (pista) · 10 Tinte azul · 12 Calcetines de lunares (pista) · 14 Mitones (playa) · 16 Calcetines caídos (pista) · 18 Una
   rodillera (pista) · 20 Licra de surf (playa) · 24 Gafas redondas · 28 Zapatillas neón · 32 Malla tres cuartos · 36 Zapatillas
   bicolor. ¿Te valen, quitas o añades alguno?
8. Recargar a mitad de partido o «Reiniciar partido» en la Carrera evita una derrota sin castigo: ¿es a propósito?
9. Torneo de la semana: ¿lo damos por cubierto con «La jugada del día»? (también arriba, en Backlog del 21-nov).
