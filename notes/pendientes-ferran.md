# Pendientes de Ferran: decisiones provisionales y preguntas (sprint «único», rama pendientes)

Lo que Ferran no respondió (o respondió a medias) se ha hecho con la **propuesta por defecto de la ficha** y queda aquí como
**decisión provisional**: cambiarlo es tocar el sitio que se indica. Lo que Ferran sí decidió está en la memoria
(make-the-cut-ideas-unico) y en las notas de cada idea; aquí no se repite.

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
- **Decisión provisional: la portada no se toca**: solo en Jugar › Retos › Semana (hay un rediseño de menús y el cambio de nombre en
  marcha). Si Ferran la quiere en la portada: `js/menu-jugador.js stampSync`, sello con «22-24» y los intentos, que abra
  `VB.UI.openRetos('semana')`.
- **Decisión provisional: Retos se abre en «Hoy»** salvo que recuerde «Semana».
- **Decisión provisional: el «3r set» empieza 1-1 sin parciales inventados**: el marcador enseña los pilotos 1-1 sin «S1 25-22 | S2
  22-25», y la hoja final solo el set jugado, rotulado «3r set».
- Al fusionar el cambio de nombre a Take the Court hay que cambiar dos cadenas: la base por defecto del enlace en `js/semana.js link()`
  ('https://purupurpito.github.io/make-the-cut/') y el `title` de `navigator.share` en `js/semana-ui.js share()`.
- El «torneo de la semana» del backlog (D1) se puede dar por cubierto con esto; `w`/`weeks` de retos.js y `{semana}` de VB.Look quedan
  sin usar (no se borran: compatibilidad del guardado).
- Preguntas:
  1. ¿La situación en la portada (sello junto a JUGAR) o solo en Retos › Semana?
  2. ¿Retos debe abrirse por defecto en «Semana»?
  3. ¿Te vale la igualdad (nivel fijo, atributos neutros, sin ayuda de novato), o los novatos en Normal?
  4. ¿Intentos solo en el aparato, sin pasar por la cuenta?
  5. En el «3r set», ¿solo «1-1» (como ahora) o los dos primeros sets con resultados inventados?
  6. ¿Damos el «torneo de la semana» por cubierto y se tacha del backlog?
