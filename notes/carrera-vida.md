# PLAN FINAL: «Carrera con vida» (Take the Court, entonces Make the Cut, sprint 1.13.0)

Base: la **Propuesta A (narrativa)**. Es la que mejor puntúan en conjunto los tres jueces (vida 8/8/9, viabilidad 8/8/7) y la única que respeta el contrato de los tests: «misma carrera con y sin el módulo». Sobre ella se injertan cuatro cosas:
- **De C:** el diseño para móvil. «Partido» sigue sin subpestañas, con avisos en chips calculados sin guardar nada y el plan plegable.
- **De B:** la Figura de la jornada y del mes con su fórmula, los objetivos con escalones y el desglose del puesto en pista.
- **De A:** la regla de oro, el feed propio, el eco y los partidos marcados.

También se corrigen los problemas que señalaron los jueces:
- No hay pacto asignado por defecto.
- No se toca ningún atributo de forma pasiva, así que no aparece la asimetría entre jugar y simular.
- No se meten trofeos en c.trophies, el Camino no da dinero ni puntos y no se tocan las ofertas.
- La prensa tiene siempre 3 respuestas, apiladas, y no cambia según el ancho de pantalla.
- Se fija un único reparto de nombres.

He verificado los ganchos en el código (solo lectura). La lista está en §4.

---

## 1. Resumen para Ferran: qué vas a ver

Hoy el bucle es «Jugar → Siguiente jornada → Jugar» y lo demás se puede ignorar. A partir de ahora, **entre partido y partido el mundo te pedirá 1-3 cosas pequeñas que dependen de lo último que pasó**. Es la idea que comparten el «móvil» del MyCareer de NBA 2K y la Central del Modo Carrera de EA FC. Todo se puede saltar: si solo pulsas Jugar, la carrera es exactamente la de hoy.

Siguen las **7 pestañas**. Algunas se reorganizan y ganan subpestañas.

| Pestaña | Qué cambia | Inspiración |
|---|---|---|
| **Partido** (sin subpestañas, como hoy) | Arriba, el ticket del partido con un **sello** si es especial (Derbi, Revancha, Televisado, Duelo, Jefe, Final). Al lado, hasta **4 avisos en chips**, cada uno lleva a donde toca: «Cris Montoya te ha escrito · Responder», «Rueda de prensa», «Pacto 2/4», «Tu semana: elige», «Candidatura a Figura del mes». Si no queda nada: «Todo al día. A jugar.». Debajo, la tarjeta **«Tu semana»**: un día libre en el que eliges 1 de 3 actividades. El **plan del entrenador** sale plegado en un chip («Plan 2/3 · Fatiga 40») y se despliega solo si te quedan sesiones por hacer. A 568x320 va en dos columnas; a 360x640, apilado. | Central y Task List de EA FC 25-27; menú de MyCareer de 2K con «Jugar» rodeado de lo pendiente; día libre de 2K16+ y Madden |
| **Mensajes** › Bandeja · **Redes** | **Bandeja**: remitentes con nombre y voz propia (tu agente Cris Montoya, tu entrenador o entrenadora, tu pareja o la capitanía, tu gente, la prensa, tu rival, tu patrocinador). Mensajes con **2 botones de respuesta** que enseñan su efecto (▲/▼). Lo que tiene pregunta no se marca leído hasta que contestas o caduca (2 jornadas). **Redes**: 3-5 publicaciones inventadas sobre TU partido (@CronistaDeArena, @PeñaVoley{Ciudad}, @NoMeConvence…) y «Publicar» una vez por jornada con 3 tonos. | Móvil de 2K (agente, marcas, fans), redes y pódcast de 2K23 y 2K25, Game Day Beats de Madden, redes de FC 25 y FC 27 |
| **Jugador** › … · **Estado** (antes «Entreno») | Lo de Entreno, más **Ánimo** (0-100, con el porqué de sus últimos cambios) y **Forma** (de −3 a +3, sacada de tus 3 últimas notas, con una gráfica pequeña de las 8 últimas). | Media dinámica de FC 27 (forma, moral, físico), moral de FM |
| **Club** › … · **Gente** (nueva) | Fichas de personas con barra, frase y «último cambio y por qué»: entrenador o entrenadora, pareja o equipo, agente, tu gente, rival (calor) y, en pista, **quien te disputa el puesto** («Tu media 7,1 frente a 7,4 de [nombre]»). | Relaciones de NHL 26 Be a Pro y MLB RTTS, Running Mate de 2K27, queja de FC por «moral sin motivo» |
| **Fama** › Fama · **Camino** (nueva) · Tienda · Logros · Legado | **Camino de temporada**: 20 niveles de estrellas con premios **solo cosméticos** (prendas, celebraciones, títulos). Se reinicia cada temporada. | Camino de 40 niveles de 2K27 y partidos clave de 2K25 (sin pase de pago) |
| **Liga** | El Calendario lleva los sellos de los partidos especiales. | Partidos clave de 2K24-25 |
| **Palmarés** › … · **Estadísticas** (nueva) · Opciones | Estadísticas por temporada, gráfica de la nota, récords («Mejor partido: 9,1 contra Voley Cádiz, T2 J5») y tus **Figuras de la jornada y del mes**. En Opciones, **«Cuánta vida: Poca / Normal / Mucha»**. | Jugador del Mes de FC; frecuencia de eventos de FC 26 |

Además:
- **Charla con el entrenador**, 2 veces por temporada (jornada 1 y ventana de mitad): eliges 1 de 3 pactos (Fácil, Normal o Difícil) para ese tramo. Viene de los objetivos personales por mitades de 2K25.
- **Rueda de prensa** cada 3-4 jornadas, con 3 tonos (humilde, de equipo o chulería) y **eco 2-3 jornadas después** («Lo dijo y lo cumplió», o «Sus palabras se le vuelven en contra»).
- **Decisiones encadenadas** sobre las que ya existen. La fiesta trae fotos en redes; el tobillo vuelve a avisar. Viene de los setbacks encadenados de FC 27.

---

## 2. Sistemas

### Reglas comunes (obligatorias para todos los paquetes)

- **Regla de oro de compatibilidad.** Solo una **elección del jugador** (responder un mensaje, elegir la carta de la semana, aceptar un pacto, contestar a la prensa, publicar) puede tocar el núcleo: `c.coach`, `c.mate.chem` o `c.chem`, `c.fatigue`, `c.money`, `c.tp`/XP de entreno y fama (`c.life.fame`). Todo lo pasivo vive en `c.story`: ánimo, relaciones nuevas, calor del rival, estrellas, figuras, muro y sellos. **No se toca `m.attrs`** en este sprint, ni las ofertas, ni `c.trophies`, ni `c.player`.
- **Estado.** Todo va en `c.story` (opcional), creado por `VB.CareerStory.ensure(c)`, que es idempotente. No se sube VER (3) ni VER6 (1).
- **Azar.** `VB.CareerStory.rng(c, 'st-<clave>', …)` = `VB.Career.beach._rng(VB.Career.beach._hash(c.seed, …))`, como `rngOf` en career-life.js:43. Sin `Math.random`. No se consumen los generadores de career.js ni el `'ev'`, `l.evN` o `lastEv` de career-life. **No se tira nada en 'create'** (careertest.js:2574).
- **La jornada en el hook 'match'.** `life('match')` corre **después** de `finishRound`, así que `c.week` ya es la siguiente. Se usan siempre `sum.season`, `sum.phase` y `f`. El núcleo guarda `s.nk`, la clave de la próxima jornada calculada al final de cada hook con `K(c)._wkKey(c)` (playa career.js:1773, pista 2352, ambos exportados en 3623 y 3573), y `s.mN`, un contador de jornadas cerradas que sirve para las caducidades sin problemas con los huecos de copa o KO.
- **Textos.** Castellano y género neutro («esa persona», «quien coloca», «tu pareja», «tu gente»; **nada de «hermane»**). Nada real. Variantes `th` y `xh` para pista, como hace EVENTS. Unas 8 variantes por situación. Ningún texto renderizado puede contener `{`, `undefined`, `NaN`, `.er` ni `·`.
- **Reparto único inventado.** Lo fija P0 en `cast`:
  - Agente: **Cris Montoya**.
  - Entrenador: nombre por club con `hash(seed,'st-coachN',clubId)` de [Alex, Dani, Noa, Sam, Ariel, Eli, Nico, Robin].
  - Medios: **Diario La Red**, **El Bloqueo Digital**, **Radio Arena FM** y el pódcast **La Pausa Técnica**.
  - Cuentas: **@CronistaDeArena** (pista: **@CronistaDePabellón**), **@ElOjoDeHalcón** (rumores), **@PeñaVoley{Ciudad}**, **@NoMeConvence** (hater gracioso, nunca cruel).
  - Familia: **«Tu gente»** y **«La peña del barrio»**.
  - Las figuras del mes y quien te disputa el puesto se sacan de las plantillas inventadas del juego.
- **Móvil.** Como mucho 2 botones por mensaje (la prensa y el pacto llevan 3, **apilados**, siempre los mismos en cualquier ancho). Toque ≥ 44 px. `<button>` dentro de `[data-nav]`. Clases que `splatify` ya convierte (`button.pri`, `.acts>button`). Probar en 568x320, 640x360 y 360x640.
- **Tope por jornada** según «Cuánta vida», con `s.freq` 0/1/2: **1, 3 o 4 cosas que piden respuesta**. Cuenta la decisión de career-life (si `c.life.ev` existe, un hueco menos), los mensajes con respuesta y la prensa. No cuentan el muro ni la carta de la semana.

### S1. Bandeja viva (paquete P1)
- **Mecánica.** En `onMatch` se evalúa una lista de unos 40 **BEATS** `{id, k, when(c,sum,ctx), pri, o:[{t, e, why}] | null, only?}`. Prioridad: eco o consecuencia diferida > partido marcado próximo > racha o bajón > relleno aleatorio. Se publican como mucho los huecos que deje el tope. Un mismo beat no se repite en 6 jornadas (`s.seenB`). Lo que no se contesta caduca en `mN+2` con una línea de cierre («Cris: “Vale, lo hablamos otro día”») y **sin efecto**. Más o menos el 60 % lleva respuesta.
- **Ejemplos.**
  - Racha de 3, agente: «Tres seguidas. Me llama gente que hace un mes no cogía el teléfono. ¿Subimos el caché o seguimos con calma?»
    - [Que esperen] ▲ Agente +5
    - [Sube el caché] ▲ dinero 0,3×sueldo de la jornada, ▼ Tu gente −3
  - Nota < 5, tu gente: «Te vimos ayer por la tele. No pasa nada, el domingo hay paella. ¿Vienes?»
    - [Voy] ▲ Tu gente +6, ▼ fatiga +3
    - [Toca entrenar] ▲ entreno +15, ▼ Tu gente −4
  - Pista, banquillo dos jornadas: el capitán dice «Tranquilidad, tu momento llegará».
    - [Pedir minutos] ▼ Entrenador −2, ▲ calor del puesto
    - [Esperar] ▲ Entrenador +2
- **Gente** (fichas de Club › Gente).
  - Barras nuevas: `ag` (50), `fam` (70) y `heat` (0-100). **Sin efecto pasivo en el núcleo.** Solo sirven de **llave de contenido**: ag ≥ 70 abre el beat «Cris te consigue un acto pagado (¿vas?)»; fam ≤ 30 abre «Llamar a casa»; heat ≥ 80 marca a esa persona como «Archienemigo», que solo se muestra y da doble estrella en el duelo.
  - Coach y química se leen del núcleo. El porqué del cambio de confianza se calcula comparando `s.coach0` (guardado en 'setup' y en 'match' antes de evaluar) con `sum.coach` o `c.coach`, y la causa sale de la nota, la victoria o la consigna (`sum.rt.best` con la consigna, career.js:1321).
  - Pista: quien te disputa el puesto sale de `VB.Career.hall.lineup(c)` y `lastSel` (exportados en career.js:3575-3577), **solo lectura**. Hay que comprobar que `lineup6` no escribe en `c`; si escribe, usar solo `lastSel`. El mensaje «Te lo has ganado, sales de inicio» sale solo cuando la alineación ya te pone de titular.
- **Prensa.** Cada 3-4 jornadas en Normal (cada 5 en Poca, cada 2-3 en Mucha) con `rng(c,'st-press',season,mN)`, y siempre tras un partido marcado o una final. No sale si la decisión pendiente de career-life es `pressWin` o `pressLoss`. Las preguntas no se repiten entre las últimas 8 (`s.pressQ`). Tres respuestas:
  - Equipo: ▲ química +5.
  - Humilde: ▲ Entrenador +3.
  - Chulería: ▲ fama ×0,04, ▼ Entrenador −4, ▲ calor +20.
  Cada respuesta deja una marca `s.flags.press = {t, mN, rv}` para el eco.
- **Cadenas** sobre los EVENTS que ya existen. Unas 10, de 2 eslabones, mediante `onAnswer(c, evKey, i)`:
  - `party` → «Circula una foto tuya bailando en el chiringuito»: [Reírte con ello ▲ fama] / [Pedir que la borren ▲ Entrenador +2].
  - `ankle` → si la fatiga es ≥ 60 en las 3 jornadas siguientes, el fisio: «Te dije que pararas».
  - `clinic` → a final de temporada, carta de la escuela con un dibujo (▲ Tu gente, solo en story).
  - `viral` → el rival lo parodia en Redes.
  - `pressWin` → la frase se cuelga en el vestuario del rival.
  - Eco de la prensa chula: si ganas el siguiente partido, «Lo dijo y lo cumplió» y Cris escribe «Me encanta cuando haces mi trabajo»; si pierdes, «Las palabras de {yo} se le vuelven en contra» y el entrenador dice «A la prensa, lo justo». **Solo publicación y mensaje: el eco no aplica efectos en el núcleo.**
- **Guardado.**
  - `s.feed:[{id,k,b,vars,o:0|1,ans:-1|i,exp:mN,mN,s,w,ph,r:0}]` con tope 30, aparte de los 40 de `c.inbox`. Los textos no se guardan: se regeneran con `b` y `vars`.
  - `s.n`, `s.seenB:{}`, `s.flags:{k:{mN,v}}` (tope 12; caducan a las 6 jornadas), `s.pressQ:[]`.
  - `s.rel={ag,fam,heat,arch:0,why:{coach,chem,ag,fam,heat:{d,t,mN}}}`, `s.coach0`.
- **Ganchos.** `VB.CareerStory.use(msgsSys)`; `onAnswer` llega desde career-life.js `answer()` (P0); los efectos van con `VB.CareerStory.fx`.

### S2. «Tu semana», Ánimo y Forma, y Pacto con el entrenador (paquete P2)
- **Tu semana.** 3 cartas por jornada de liga o copa con `rng(c,'st-week',nk)`, sacadas de una bolsa de 16 con pesos 6/3/1 (común, poco común, rara). Las cartas `only:'beach'|'hall'` se filtran. **«Descansar» siempre está entre las 3.** No se repiten las de la jornada anterior. Se elige 1 o ninguna, y la que no se elige caduca. No sale en las fases 'off' y 'pick' ni con banquillo previsto en playa.
  - Comunes:
    - «Descansar en casa»: fatiga −10, ánimo +5.
    - «Entrenar extra con {mate}» (pista: «con quien coloca»): química +5, fatiga +6.
    - «Comer con tu gente»: Tu gente +8, ánimo +3.
    - «Vídeo de {rival}»: entreno +20 en defensa, Entrenador +2.
    - «Café con Cris Montoya»: Agente +8.
  - Poco comunes:
    - «Sesión de fotos para {sponsor}» (solo con patrocinio): dinero 0,3×sueldo, fatiga +4.
    - «Clínic en tu antiguo club»: fama ×0,03, Tu gente +4.
    - «Yoga en la orilla» (playa) o «Piscina de recuperación» (pista): fatiga −15.
    - «Entrevista en Radio Arena FM»: fama ×0,04 y fuerza una pregunta de prensa la jornada siguiente.
    - «Cena con la plantilla» (pista): química +6.
  - Raras:
    - «Torneo benéfico 3x3 en la plaza»: fama ×0,08, fatiga +12, ánimo +6.
    - «La Pausa Técnica te invita al pódcast»: fama ×0,06.
    - «Clase con una leyenda inventada»: entreno +40.
    - «Visita a tu primer club»: ánimo +10.
  - El efecto se ve antes de elegir con `effHint` (P0 lo exporta).
- **Ánimo.** De 0 a 100; empieza en 60. **Vive solo en story y no afecta al campo en este sprint** (activarlo con ±1 queda como decisión aparte; ver §5).
  - En `onMatch`: victoria +4, derrota −3, racha ≥ 3 +2, nota ≥ 7,5 +3, nota < 5 −4, banquillo −5 (`sum.bench`), fatiga ≥ 70 −2, promesa incumplida (`c.broken === season`) −8 una sola vez, pacto cumplido +6 o fallado −3. Además tiende a 60 a razón de 2 por jornada.
  - Tramos: Hundido (< 25), Apagado (25-44), Centrado (45-69), Con ganas (70-89), En una nube (≥ 90).
  - Efectos solo como llave: ≤ 30 abre el beat «Necesitas desconectar» (elección: [Desconectar ▼ fatiga −10, ▼ Entrenador −1] / [Seguir]); ≥ 90 abre «Te ves imparable» ([Bajar el ritmo] / [A tope], con efectos elegidos). También cambia el tono de Redes.
  - Se guarda el porqué de los 5 últimos cambios.
- **Forma.** `clamp((media de las 3 últimas notas jugadas, no simuladas, de c.notes − 6,5)×2, −3, 3)`, igual que `myForm6` (career.js:1964). Es derivada, no se guarda y solo se muestra: chip «En racha +2» en el ticket y en Jugador › Estado, con una gráfica SVG de las 8 últimas notas.
- **Pacto.** En la jornada 1 (hooks 'newSeason' y 'join', pero **sin tirar en 'create'**) y al abrir la ventana de mitad (playa `MID_WEEK = 7`, career.js:50; pista `midWeek6`, 2216; se detecta en `onMatch` con `c.window === 'mid'` recién abierta) llega un mensaje del entrenador con 3 pactos del catálogo (unos 18, filtrados por puesto o estilo; cifras escaladas con `VB.CareerLife.ptsF`) mediante `rng(c,'st-pact',season,blk,rol)`.
  - Fácil: si se cumple ▲ Entrenador +5; si no ▼ −2.
  - Normal: ▲ +8; ▼ −4.
  - Difícil: ▲ +12; ▼ −6.
  - Ejemplos: «No bajar de 6,5 en tus próximos 4 partidos», «8 bloqueos punto antes de la jornada 13», «Ganar 2 fuera», «Cumplir 3 consignas», «Pista, líbero: 12 recepciones perfectas».
  - **Si no eliges, no hay pacto ni efecto.** El progreso se mide como diferencia sobre `c.stats` y `c.notes` desde `base`, y se ve como chip «Pacto 2/4». Los partidos simulados cuentan, con la nota a mitad de peso.
  - Mensajes de cierre: «Lo prometido. Así me gusta» o «Hablamos de esto y no ha salido. Ya sé que puedes más».
- **Guardado.** `s.wk={k:nk,o:[ids],pick:-1|i}` (si `k ≠ nk`, se regenera), `s.mood=60`, `s.moodLog:[{d,t,mN}]` (5), `s.pact={s,blk,id,goal,base,until,diff,st:'open'|'ok'|'ko'}|null`, `s.pactLog:[]` (6).
- **Ganchos.** `use(weekSys)`. Las acciones `st-wk-N` y `st-pact-N` llegan por `VB.CareerStory.act`. La tarjeta se pinta con `ui.week(c,HLP)` y la ficha con `ui.state(c,HLP)`.

### S3. Redes y partidos marcados (paquete P3)
- **Muro.** En `onMatch` se generan 3-5 publicaciones (2 si fue jornada de banquillo: «¿Por qué no juega {yo}?»).
  - Situaciones, unas 14: nota ≥ 8, nota < 5, remontada (con `setScores`), barrida, ace decisivo (`sum.rt.best`), error en punto de set (`sum.rt.worst`), racha ≥ 3, duelo ganado o perdido, banquillo, fichaje, patrocinio nuevo, decisión contestada, partido marcado y eco.
  - Autores: los del reparto, más tu pareja o la capitanía, el rival y el patrocinador («#EquipoChanclasVoladoras»).
  - Me gusta = `round(seguidores × (0,02..0,08))`, que se muestra como «1,2 mil».
  - No se repite ninguna plantilla de las 3 últimas jornadas (`s.wallSeen`).
  - Ejemplo: «@CronistaDeArena: Voley Gijón 0-2 {club}. {yo}, 8,4 y tres aces. A esta persona hay que empezar a tomársela en serio.»
- **Publicar.** Una vez por jornada, como elección:
  - Humilde: química +3.
  - Chulería: fama ×0,02, Entrenador −2, calor +10.
  - Gracioso: Tu gente +3, fama ×0,01.
- **Partidos marcados.** `tagFor(c, fixture)` es una función pura. Prioridad: Duelo (el reto de career-life es duelo) > Final o Eliminatoria (fase cup o ko) > Jefe (`bossFor`, solo playa) > Derbi (misma `city`) > Revancha (perdiste el último contra ese club en `c.notes`) > Televisado (1 de cada 5 con `rng(c,'st-tv',season,nk)`, solo con escalón de fama ≥ 2).
  - Al final de cada hook se guarda la etiqueta del próximo partido en `s.mk={k:nk,tag}`. Así `onMatch` sabe qué etiqueta tenía el partido jugado o simulado, aunque `simulateNext` no pase por 'setup' (career.js:1492).
  - En 'setup': `m.career.story = {tag, line}`, la línea de la previa.
  - Efecto, solo narrativo: publicación extra, rueda de prensa garantizada (marca para P1) y estrellas (P4).
  - Ejemplos de línea: «Revancha: la última vez {rival} os ganó {s1}-{s2}. {mate} dice que no ha dormido bien desde entonces». «Televisado: Radio Arena FM y la tele local retransmiten. La peña del barrio ya ha avisado a todo el mundo».
- **Guardado.** `s.wall={s,w,p:[{a,t,v,lk}]}`, solo con la última jornada y la anterior. `s.wallSeen:[]`, `s.post:mN`, `s.mk`.
- **Ganchos.** `use(wallSys)`, `ui.wall(c,HLP)` y `tagFor`. Se exporta `VB.CareerStory.pushWall(c,{a,t,v})` (núcleo) para que P1 y P4 publiquen ecos y premios. En recap.js, `stake(info)` (línea 143): si existe `info.career.story && info.career.story.tag`, se devuelve su línea como `t1` (unas 3 líneas, **la única edición de recap.js**, la hace P3 con su caso en `tools/recaptest.js`).

### S4. Figuras, Estadísticas y Camino (paquete P4)
- **Figura de la jornada** (solo liga y solo partidos jugados, no simulados; en pista, con nota válida según `NOTA_MIN_SUB`). Se generan 3 figuras inventadas de tu liga (nombres de las plantillas) con nota `6,6 + 1,6·r() + 0,05·(ovr del club − 60)` y `rng(c,'st-fj',season,f.week,lid)`. Si tu `sum.nota` supera la mejor, eres Figura de la jornada. Con nota ≥ 7,4 entras en el Equipo ideal.
- **Figura del mes.** Tramos de 4 jornadas de liga (playa: J1-4, J5-8, J9-12, J13-14; pista: se reparte `weeksOf6` en 2 o 3 tramos). Hacen falta ≥ 3 partidos jugados. Una jornada antes del cierre aparece el chip de candidatura («Candidatura: tu media 7,4; [figura] 7,6»). Al cerrar, se compara con 2 figuras (`6,9 + 0,8·r()`) que escalan con el nivel de la liga.
  - Premio: estrellas, mensaje y publicación. **Ni fama, ni XP, ni trofeos en c.trophies.**
- **Estadísticas** (Palmarés). Por temporada, a partir de `c.history`, `c.stats` y `c.career`. Gráfica SVG de `c.notes`. Récords de un partido (`s.rec={nota,aces,kills,blocks,digs:{v,s,w,rival}}`, actualizados en `onMatch` con `sum.me`). Historial de figuras.
- **Camino.** 20 niveles de 3★ cada uno, que se reinician en 'newSeason' (la temporada anterior queda en `pathHist`). Estrellas por:
  - reto de la jornada cumplido 1 (`sum.life.ch.ok`, que deja career-life en `afterMatch`, career-life.js:985; por eso story corre **después** de CareerLife);
  - duelo ganado 2;
  - partido marcado ganado 2;
  - nota ≥ 8: 1;
  - Figura de la jornada 1;
  - Figura del mes 2;
  - pacto cumplido 3;
  - prensa contestada 1;
  - carta de la semana 1 de cada 2;
  - título o ascenso 5 (hook 'season').
  - Premios, cada 2-3 niveles y **solo cosméticos**: títulos de perfil («Currante del año», «Showtime»), fondos SPLAT para el ticket, celebraciones que aún no tengas (API de celebraciones de career-life, solo si existe) y prendas que ya existen en look.js mediante `VB.Look.grant(id)` (look.js:860) si no las tienes. Ni dinero ni puntos de mejora.
- **Guardado.** `s.fj={k,won,ideal}`, `s.mo:[{s,t,won,me,top}]` (últimas 3 temporadas), `s.mvpN`, `s.rec`, `s.pass={s,st,lv,got:[]}`, `s.pathHist:{}`, `s.title:''`.
- **Ganchos.** `use(seasonSys)`, `ui.pass(c,HLP)` y `ui.stats(c,HLP)`. Los chips de candidatura salen de `chips()`.

### S5. Avisos de Partido (núcleo de la interfaz, paquete P0)
Generador **puro**, sin azar ni guardado: `VB.CareerStoryUI.chips(c)` reúne los `chips(c)` de cada subsistema más los que salen de datos que ya existen:
- decisión pendiente (`VB.CareerLife.pendingEvent`);
- oferta de patrocinio (`c.life.spOffers`);
- ventana con ofertas (`c.window === 'mid'` y `c.offers`);
- puntos sin gastar (`c.player.pts`);
- último año de contrato (`c.contract.years ≤ 1`, desde la jornada 10).
Se ordenan por `p` y se enseñan como mucho 4. Cada uno es un `<button data-tab data-s>` o `data-act="st-…"`.

---

## 3. Paquetes de trabajo (en paralelo)

**API del núcleo (contrato entre paquetes).** La entrega P0, fase A, **antes** que el resto. Fichero `js/career-story.js`:

```js
VB.CareerStory = {
  hook(c, kind, a, b),            // lo llama life(); despacha a los sistemas registrados en orden de use()
  ensure(c),                      // crea/repara c.story = {v:1, n:0, mN:0, nk, freq:1, feed:[], flags:{}, ...}; sin tiradas
  use(sys),                       // sys = {id, tpl:{beatId:{k,t,x,th?,xh?,o?:[{t,e}]}}, onSetup(c,m,ctx), onMatch(c,sum,f,ctx),
                                  //        onSeason(c,ctx), onNewSeason(c,ctx), onJoin(c,ctx), onAnswer(c,evKey,i), onAct(c,act,b)->res,
                                  //        chips(c)->[{p,ic,t,tab?,s?,act?}], ui:{inbox?,wall?,week?,state?,people?,pass?,stats?,opts?}}
  ctx: {season, phase, week, mN, nk, played:{tag, wk}},   // ctx que reciben los on*
  rng(c, ...keys), K(c), cast(c), freq(c), budget(c),     // budget = huecos que quedan esta jornada (cuenta c.life.ev)
  post(c, {k, b, vars, o, exp}) -> entry|null,            // respeta tope de feed (30) y budget si o
  answer(c, id, i) -> [textos de efecto],                 // aplica tpl.o[i].e con fx y marca ans
  fx(c, e, why) -> [textos],      // e con claves del núcleo (coach, chem, fatigue, money, fame, train) → VB.CareerLife.applyEff;
                                  // claves de story (mood, ag, fam, heat, star) → c.story; anota why
  flag(c,k,v), flagAt(c,k), why(c, who, d, t), pushWall(c, {a,t,v}), text(c, entry) -> {t, x, o:[{t, hint}]},
  act(act, b)                     // enruta 'st-<sysId>-…' al onAct del sistema; guarda con K(c).save(c)
};
```

El núcleo nunca llama a `save` dentro de `hook`: ya guarda el motor después. Fuera del hook (acciones de la UI), sí guarda.

| Paquete | Ficheros propios (nuevos) | Hace | Pruebas |
|---|---|---|---|
| **P0 Núcleo e integración** | `js/career-story.js`, `js/career-story-ui.js`, `tools/storyhelp.js`, `tools/storytest.js` | Fase A: la API de arriba, el reparto, el tope y `s.mN`/`s.nk`. Fase B: la UI de enlace (avisos, plan plegable, dos columnas, bandeja mezclada, enrutado `st-`, Opciones › Cuánta vida, CSS SPLAT inyectado como `css()` en career-life-ui.js:103) y **todas las ediciones de ficheros compartidos** (§4). | `storyhelp.js` arranca vm con FILES y `withStory` (sí/no), y un autopiloto de N temporadas en playa y pista que contesta la decisión de career-life con 0 (como careertest.js:1462) y opcionalmente elige la opción 0 del feed y la carta 0. En `storytest.js`: (1) **contrato**: 3 semillas × 6 temporadas, playa y pista, sin elegir nada en story, con y sin los ficheros story, `strip` de story/inbox/msgN/created/world, todo idéntico; (2) mismo resultado dos veces con elecciones (determinismo); (3) ningún `Math.random` en `js/career-story*.js` (grep); (4) crear no gasta tiradas; (5) un guardado v1/v2/v3 viejo sin story carga y `ensure` lo repara; (6) un story corrupto (`feed: 'x'`) se sanea; (7) career-ui se carga sin career-story y con él (document falso, como careertest.js:2492), y `chips` sin `undefined`. |
| **P1 Bandeja, Gente y Prensa** | `js/career-story-msgs.js`, `tools/storymsgtest.js` | S1 completo: unos 40 beats, prensa, unas 10 cadenas con `onAnswer`, Gente (`ui.people`), `ui.inbox` (el feed mezclado con `c.inbox` al pintar, recibe `msgHTML`). | Caducidad a las 2 jornadas sin efecto; tope por `freq`; sin repetir un beat en 6 jornadas; `onAnswer` solo escribe en story; la cadena `party` se dispara 2 jornadas después con la marca; prensa nunca junto a `pressWin`/`pressLoss`; textos renderizados de todos los beats en playa y pista sin `{`, `undefined`, `NaN`, `.er` ni `·`; rival interno sin cambiar `c` (comparar JSON antes y después). |
| **P2 Semana, Ánimo y Pacto** | `js/career-story-week.js`, `tools/storyweektest.js` | S2: `ui.week`, `ui.state`, chips «Tu semana» y «Pacto». | Misma semilla, mismas cartas; «Descansar» siempre presente; carta no elegida sin efecto; ánimo en [0,100] y tiende a 60; pacto sin elegir no toca `c.coach`; pacto Fácil cumplido da exactamente +5 (escenario forzado); la forma coincide con `myForm6` en pista. |
| **P3 Redes y partidos marcados** | `js/career-story-wall.js`, `tools/storywalltest.js` (+ un caso en `tools/recaptest.js` y 3 líneas en `js/recap.js`) | S3: generación del muro, Publicar, `tagFor`, `s.mk`, línea de previa, `ui.wall`, sello para el calendario. | Muro de 3-5 entradas (2 con banquillo); sin plantillas repetidas en 3 jornadas; `tagFor` puro (dos llamadas iguales y `c` sin cambios); Revancha detectada; la etiqueta del partido simulado coincide con `s.mk`; recaptest: `stake` usa `career.story` y sin él queda como antes. |
| **P4 Figuras, Estadísticas y Camino** | `js/career-story-season.js`, `tools/storyseasontest.js` | S4: `ui.pass`, `ui.stats`, chip de candidatura. | Figura solo en liga y en partidos jugados; las figuras del mes son deterministas; el Camino se reinicia en la nueva temporada y no cambia dinero, `pts` ni `trophies` (comparar con y sin); `grant` solo con ids que existen en `VB.Look.CATALOG`; `careertest.js:2250` (el vestuario no cambia la carrera) sigue en verde. |

Dependencias: P1-P4 solo dependen de la API de P0 (fase A). Mientras no esté, cada uno puede probar con un `career-story.js` mínimo que cumpla la firma. Ninguno de P1-P4 edita career.js, career-ui.js, career-life.js ni index.html.

---

## 4. Puntos de integración compartidos (los hace **solo P0**, en este orden)

1. **js/career.js:1007** `life()`: el array pasa a `[VB.CareerLife, VB.CareerWorld, VB.CareerStory]`. Una línea. Story va el último para leer `sum.life`.
2. **js/career-life.js**:
   - Fachada (alrededor de la línea 1105, `VB.CareerLife = {…}`): añadir `applyEff: applyEff, effHint: effHint` (definidas en 507 y 483; hoy no se exportan).
   - `answer()` (497): justo antes de `l.ev = null;`, añadir `if (VB.CareerStory && VB.CareerStory.hook) try { VB.CareerStory.hook(c, 'answer', l.ev.key, i); } catch (e) {}`. No toca `evN`, `lastEv` ni el rng `'ev'`, así que `lifetest.js:349` no cambia. **Ojo:** el autopiloto de careertest llama a `answer(0)`, así que esto corre en el test de contrato y solo puede escribir en story.
3. **js/career-ui.js**:
   - `SUBS` (35-48): `inbox:[['box','Bandeja'],['wall','Redes']]`; `player`: la etiqueta de `'train'` pasa a `'Estado'` (mismo id, para no romper `opts.train`, 2686); `club`: `['people','Gente']` tras Compañero, también en `SUBS6.club` tras Equipo; `life`: `['pass','Camino']` tras Fama; `honors`: `['stats','Estadísticas']` tras Palmarés.
   - `sub` (51): añadir `inbox:'box'`.
   - Filtro (1081): ocultar `wall`, `people`, `pass` y `stats` si no hay `SUI()` (patrón `LUI`/`WUI`, con `function SUI(){ return VB.CareerStory && VB.CareerStoryUI || null; }`).
   - `renderInner` (1093-1101):
     - Bandeja: `SUI() ? SUI().inbox(c,HLP,msgHTML,freshIds) : renderInbox(c,freshIds)`. Más `wall`, `people` (dentro de `renderClub`), `life/pass` antes de delegar en `LUI().render`, `honors/stats` y `train` → `SUI().state(c,HLP)` + `renderTrain`.
     - `readAll` (1068) se queda igual: solo marca `c.inbox`.
     - El contador de la pestaña suma `SUI().pending(c)`.
     - Punto en `match`: `SUI().chips(c).length > 0`.
   - `renderMatch` (1329) y `renderMatch6` (1756): tras el ticket, `SUI().chipsHTML(c,HLP)` y `SUI().weekCard(c,HLP)`; `trainCard` (1257) envuelto en el plegable (botón `st-plan`, estado en `localStorage['make-the-cut.career.planFold']` con try/catch, **desplegado si hay sesiones pendientes y el entreno automático está apagado**); `lastCard` y los titulares, plegables; contenedor `.cr-two` en dos columnas con `@media (min-width:560px) and (max-height:420px)`. **El foco al volver de la hoja final sigue en «Jugar partido»** (2686-2688; `focusReq`).
   - `ticketHTML` (1324): sello pequeño en una esquina con `SUI().tagFor(c, f)`, sin que el ticket crezca en alto.
   - `renderCal` (1485) y `renderCal6` (1852): sello en los 3 próximos partidos.
   - `onClick` (2150): `if (act && act.indexOf('st-') === 0 && SUI()) { var r = SUI().act(act, b); … }`, igual que `cw-` (render, tab, s, focus).
   - Palmarés › Opciones: `SUI().optsHTML(c)` («Cuánta vida»).
4. **index.html** (5446-5451): después de `career-world-ui.js` y **antes** de `career-ui.js`: `career-story.js`, `career-story-msgs.js`, `career-story-week.js`, `career-story-wall.js`, `career-story-season.js`, `career-story-ui.js`. El orden de los submódulos fija el orden de `use()`: msgs, week, wall, season.
5. **tools/careertest.js:27** `FILES`: añadir los 5 ficheros de lógica story, y `career-story-ui.js` en `uiFiles` (2497). La prueba de contrato de career-world (1466) amplía su `strip` con `delete o.story`.
6. **js/recap.js:143** `stake()`: 3 líneas (las hace P3; P0 solo revisa).
7. **js/version.js:34**: `VB.VERSION = '1.13.0'` y una entrada de novedades **solo con la novedad** («La Carrera cobra vida: mensajes que piden respuesta, redes, tu semana, pacto con el entrenador, Figura del mes, Camino de temporada»), sin arreglos menores. Va al final, al publicar.
8. **notes/carrera.md** (§Vida) y **TRASPASO.md**: documentar `c.story`, las claves de rng `st-*` y la regla de oro.

**Orden:** P0-A (núcleo y helper) → P1, P2, P3 y P4 en paralelo, a la vez que P0-B (enlace con la UI) → integración (cargar todo, careertest, lifetest, worldtest, recaptest, storytest y los 4 de los paquetes en verde) → pasada de móvil en 568x320, 640x360 y 360x640, con mando (Q/E, LB/RB, RePág/AvPág) → equilibrio de los textos → versión 1.13.0 → pasada de fallos tras publicar.

---

## 5. Riesgos y qué queda fuera

**Riesgos**
- **El contrato de los tests** es la garantía principal. Cualquier efecto pasivo en el núcleo lo rompe; `storytest` (1) lo vigila en playa y pista. Las acciones de la UI (elecciones) son las únicas que lo cambian, y el autopiloto no las hace.
- **Orden y jornada en el hook.** Story tiene que ir después de CareerLife. Hay que usar `sum.season`, `sum.phase`, `f`, `s.nk` y `s.mN`, nunca `c.week − 1` (falla al cambiar de fase o de temporada).
- **Guardado.** Solo `c.story`, sin tocar VER ni VER6 y nada en `c.player` (`saneAthlete`, career.js:229 y 2122). Hay que comprobar que `migrate` y `saneDeep` (240-362) conservan `c.story` en v1, v2 y v3.
- **Bandeja.** El feed va aparte (tope 30) y no desplaza los 40 de `c.inbox`. El contador de pendientes no se queda fijo porque todo caduca a las 2 jornadas; hay que probarlo también en pista (`readAll6`, 3274).
- **Volumen de textos** (unos 200-250 plantillas, 8 variantes por situación). Es el verdadero cuello de botella: P1 y P3 deben empezar por los textos, y Ferran debe revisar el tono de @NoMeConvence y del rival (graciosos, nunca crueles).
- **Móvil.** Partido con chips, la tarjeta de la semana y el plan pueden alargar la columna a 360x640. Por eso son plegables y hay como máximo 4 chips. El plan plegado no debe esconder sesiones pendientes. Club y Fama pasan a 5 subpestañas: hay que comprobar el desplazamiento horizontal de la tira.
- **`lineup6` de solo lectura:** comprobarlo antes de usarlo para quien te disputa el puesto.
- **Nombres:** comprobar que el reparto no coincide con ninguna figura real conocida del vóley.
- **Proceso.** Antes de empezar, mirar las ramas y la memoria de otras sesiones por si ya hay bandeja o redes empezadas (lo que pasó el 17-nov). Esto va como novedad de sprint que abre Ferran. No tocar el Acta oculta ni el online.

**Fuera de este sprint** (quedan para el siguiente, con su propio test con y sin módulo):
- Ánimo con efecto en el campo (±1). Necesita resolver la asimetría con `simulateNext`, que no lee `m.attrs` (career.js:1492), y calibrarlo con el autopiloto.
- Club soñado con agente y renovación por rondas. Obligan a factorizar `offerFor` en `genOffers` y `genOffers6` y a tocar `stay()` y `newSeason()`.
- Bonus del agente en las ofertas (`offerBonus`).
- Selección nacional y Circuito de verano. Necesitan un partido suelto en `matchSetup6` y en main.js.
- Lesiones, cesiones y orígenes.
- Identidad Carisma/Currante (poco valor para su coste, según los jueces).
- Prendas nuevas exclusivas del Camino (condición `{path:n}` en look.js) y premios del Camino con dinero o puntos.
- Archienemigo que te sigue de liga (habría que tocar `ensureRival`).

**Ficheros revisados (sin modificar):**
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/career.js (life 1007; closeMine y sum 1425-1468; simulateNext 1492; wkKey 1773; myForm6 1964; midWeek6 2216; wkKey6 2352; fachadas HALL 3563-3577 y BEACH 3623-3628)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/career-ui.js (TABS/SUBS/sub 35-51; renderInner 1060-1103; MSG_K/renderInbox 1685-1692; onClick 2144-2175; open/foco 2680-2692)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/career-life.js (rngOf 43; effHint 483; answer 497; applyEff 507; afterMatch 962-1013; hook y fachada 1099-1115)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/career-life-ui.js (matchCards 108, render 145, act 286, export 307)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/recap.js (stake 143, introPlan 181)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/look.js (grant 860)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/js/version.js (VERSION 34)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/index.html (scripts 5440-5455)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/tools/careertest.js (FILES 27, contrato 1460-1470, carga de la UI 2492-2501)
- C:/Users/Puru/FCVBARB/carpetas/voley-3d-look/tools/lifetest.js
