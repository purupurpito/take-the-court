# Pendientes de Ferran: decisiones provisionales y preguntas (sprint «único», rama pendientes)

Lo que Ferran no respondió (o respondió a medias) se ha hecho con la **propuesta por defecto de la ficha** y queda aquí como
**decisión provisional**: cambiarlo es tocar el sitio que se indica. Lo que Ferran sí decidió está en la memoria
(make-the-cut-ideas-unico) y en las notas de cada idea; aquí no se repite.

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
