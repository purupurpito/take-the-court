# Nota en directo y prueba gastada (especificación, 15-nov-2026)

Petición de Ferran: «Reiniciar una prueba debería de gastarla. Además, lo de la nota quiero que pase siempre, en las pruebas de
acceso y en los partidos normales de la carrera. Quiero que sea como en el FIFA, que tienes una nota durante todo el partido y las
buenas acciones sumen y las malas resten.»

Resumen: en todos los partidos **jugados** de la Carrera (playa y pista, también el partidillo de prueba) hay una nota en directo
de 0 a 10 con un decimal. Empieza en 6,0, sube con lo bueno que hace tu jugador, baja con lo malo y, muy poco a poco, sin
participar. La nota final del partido es esa nota, y sustituye a `rating()` en todo lo que usa la nota. Reiniciar o abandonar una
prueba la gasta: cuenta como suspendida.

---

## 1. Cómo lo hace EA SPORTS FC / FIFA (investigación breve)

EA no publica la fórmula. Lo que sigue sale de las notas oficiales del modo Carrera, de guías y de foros de jugadores, así que
tómalo como orientativo.

- **Empieza en 6,0.** Los jugadores de campo arrancan en 6,0. En FC 25 hubo un fallo en el que los porteros empezaban en 4,8
  ([foro EA FC 27, «Player Career match ratings»](https://forums.ea.com/discussions/fc-27-career-mode-en/player-career-match-ratings/13804869)).
- **Lo que suma y lo que resta.** Goles y asistencias son lo que más pesa. Muchas acciones pequeñas (pases, regates) apenas
  mueven la nota. Restan perder el balón, los pases malos, los tiros malos, las faltas y las tarjetas
  ([guía FIFA 17, gamepressure](https://www.gamepressure.com/fifa17/earning-good-match-ratings/z391fc);
  [foro EA FC 26, «Match rating still terrible»](https://forums.ea.com/discussions/fc-26-feedback-en/match-rating-still-terrible/13436457)).
- **Baja sin hacer nada.** En los foros se cuenta que la colocación se puntúa durante todo el partido, y alguien cuenta que bajó
  de 6,0 a 5,4 en un partido en el que el balón no le llegó
  ([Operation Sports, «What is Match Rating exactly?»](https://forums.operationsports.com/forums/forum/soccer/ea-sports-fc-and-fifa/637249-what-is-match-rating-exactly)).
- **En pantalla.** La nota en directo se ve en el widget de rendimiento, arriba a la derecha, o en la barra del nombre
  ([FC 26 Player Name Bar](https://fifauteam.com/fc-26-player-name-bar/);
  [foro EA, widget de rendimiento en Clubs](https://forums.ea.com/discussions/fc-26-game-modes-en/clubs-player-performance-widget/12667696)).
  Cuando haces algo que da XP, aparece junto al indicador de tu jugador un icono pequeño de tres galones
  ([Pitch Notes FIFA 22, modo Carrera](https://www.ea.com/en-gb/playtesting/news/pitch-notes-fifa-22-career-mode-deep-dive)).
- **Qué hace la nota final.** «La gran mayoría de la XP sale de la nota del partido al final», y los objetivos del partido
  deciden los minutos y la titularidad (Pitch Notes FIFA 22). La media de la temporada sale de esas notas (ver un fallo de FC 26
  que las ponía a 0,0: [foro EA](https://forums.ea.com/idea/fc-26-bug-reports-en/career-mode-live-start-point-breaks-average-match-ratings/13042848)).

Qué tomamos para Make the Cut: arrancar en 6,0, que muchas acciones pequeñas sumen poco y las decisivas más (aces, bloqueos,
errores), una deriva suave hacia abajo si no participas, un aviso pequeño y discreto, y que la nota final mueva la XP, la
confianza del entrenador, la titularidad y los premios (que ya es así). No copiamos su widget: la píldora usa el estilo del
marcador del juego (`.sb`).

---

## 2. Cómo está hoy (lectura del código)

### 2.1 La nota de hoy: `rating()` (js/career.js, l. 1290-1302)

```
k   = 40 / max(24, puntos) × kmul                  (kmul: playa 1; pista RATE6[puesto]; prueba ver abajo)
raw = 5,4 + k × Σ RATE_W[stat] × stat + resultado
RATE_W = { kills 0,055, aces 0,2, blocks 0,2, assists 0,045, digs 0,035, recvP 0,03, perfect 0,02, poor −0,015, errors −0,17 }
resultado: 2-0 +0,9 | 2-1 +0,6 | 1-2 −0,3 | 0-2 −0,6
techo suave por encima de 8,5: 8,5 + 1,5·(1 − e^(−(raw − 8,5)/1,5)); clamp 1-10; round1
```

- **Playa** (`matchDone`, l. 1403): `rating(mine, res, rallies)`, donde rallies = M.rallies.
- **Pista** (`matchDone6`, l. 2967): `rating(mine, res, meR, RATE6[ctrlRole6(c)])` con
  `RATE6 = { OH 3,0, OPP 2,8, MB 3,4, S 2,0, L 4,0 }`. Si juegas menos de `NOTA_MIN_R = 12` puntos (y el partido no es *legacy*),
  sale `nota = null` («s. c.»).
- **Prueba** (`trialGrade`, l. 3274): `kmul = max(24,R)/max(15,R) × (pista ? RATE6 : 1)`, o sea k = 40/max(15,R)·rol. Un 0-1 cuenta
  como 1-2 (−0,3). Encima se suma `TRIAL_GOAL = 0,25` por objetivo cumplido, y la letra sale de
  `TRIAL_CUT = A+ 8,0 | A 7,2 | B 6,5 | C 5,8 | D 5,0 | F`.
- **Simulados** (`simulateNext`, `simulateNext6`): tienen su propia fórmula aleatoria (6,1 + …). **No cambian.**
- **Calibrado de hoy** (notes/carrera.md §Nota, Regional T1, 28 partidos por bot): novato **6,14** (4,6-7,9), medio **7,78**
  (5,7-9,1), bueno **9,10** (7,3-9,7), ningún 10. Pista: el autopilot de receptor saca ~7,3 contra Normal. Los retos de
  career-life.js por puesto van de 6,0 a 8,6.

### 2.2 El acumulador M e `ingest` (l. 1212-1286)

`newM(g)` crea `M.p[0|1]` (0 = tu jugador, 1 = el compañero o el resto del equipo; `slotOf`: en pista `pl === g.ctrl`). Lleva
además `last0`, `lastTeam`, `server`, `setter`, `cand`, `blocker`, `prevKind/prevTeam`, `rallies`, y para los cambios `on`, `meR`,
`setNo`, `sets`, `started`, `entered`, `pulled` y `subEv`. Con `newMatch` se reinicia. `ingest` se salta `g.demo` y
`g.autopilot`. `abortMatch()` pone M = null.

### 2.3 Los eventos de la sim (js/sim.js)

| evento | campos útiles | quién |
|---|---|---|
| `hit` (l. 1377; saque l. 2734) | `kind` serve/pass/set/spike/free, `touch` 0-3, `grade` perfect/good/poor, `human`, `recv`, `dig`, `shot` (shank, tip…), `jset` | `player`, `team` |
| `block` (l. 1496) | `result` stuff/touch/…, `human` | `player` (q) |
| `point` (l. 2018) | `team` (quien gana), `reason` in/out/antenna/under/net/double/four/serve/block/position/backBlock/attackServe, `how` ace/kill/tip/block/error/free, `player` (quien hace la falta), `assist`, `lastKind`, `setWon`, `matchWon`, `score` | |
| `set` / `match` / `gameOver` | `team`, `sets`, `setScores` | |
| `newMatch`, `newSet` | `setNo` | |
| `sub`, `lineup` (pista) | `meIn`, `meOut`, `why` | |

`fault(g, t, reason, text, p)` es `point(g, 1−t, …, p)`. Las faltas personales llevan `e.player`.

### 2.4 Dónde se usa la nota

- `closeMine` (playa): XP = `(40 + 22·nota + 40 si ganas + 6·mín(puntos,10)) × liga × D.xp`; entrenador
  `(nota − D.coachPivot)·2,5 ± 1`; `c.notes.push({nota…})`; `sum.nota`.
- `closeMine6` (pista): igual, pero × parte jugada. `IMPACT_COACH` cuando entras desde el banquillo con nota ≥ 7. Mensaje «Te he
  cambiado» con nota < 6. `scoutCheck6(c, nota)` (≥ 7,3). XP de banquillo cuando no hay nota.
- `form(c)` y `avgNota(c)` sobre `c.notes` → `lineup6` (SEL_FORM), ofertas (`offerScore`, `midNota`), premios de fin de temporada
  (`AWARDS`: MVP por nota media).
- career-life.js: reto «nota» (`chOk`), fama (`max(0, nota − 5,5) × 22`), `pressWin` (nota ≥ 7).
- Prueba: `trialDoneOn` → `trialGrade` → letra → `trialResolve`.
- main.js `careerEndSheet` («Nota: 7,4 | +312 XP», «s. c.») y `trialEndSheet` (letra grande + nota).
- ui.js: hoy el HUD no enseña ninguna nota.

### 2.5 Reiniciar y abandonar la prueba hoy

- `trialSetup`/`trialSetup6` llaman a `trialMark` (`c.pick.trial = {club, offer, goals, tries}`) y **guardan**.
- «Reiniciar partido» (ui.js `btnRestart`, dos pulsaciones en 2 s) → `startMatch()` → main.js, con `g.career.trial`, vuelve a
  llamar a `startCareerTrial(offer)` (tries + 1, la oferta sigue).
- «Salir al menú» (una pulsación) → `toMenu`: sin `careerEnd`, `abortMatch()` y `CareerUI.open('pick')`; la prueba queda «A
  medias».
- Textos: career-ui.js l. 938/942 (`trialLine`, etiqueta «A medias») y l. 1506 («Si abandonas o reinicias, no pierdes la
  prueba»); notes/pruebas-entrenos-spec.md l. 9, 106, 204, 235 y 265.

---

## 3. Diseño de la nota en directo

### 3.1 Modelo

```
nota = soft(6,0 + raw)                                       (se ve con un decimal; por dentro, con 3)
raw  = Σ acciones tuyas (W[acc] × K)                         (lo que haces)
     + Σ puntos con tu jugador en pista (± TEAM_PT / E)      (cómo va el equipo; sin aviso)
     + sets y partido (RES)                                  (con aviso)
     − OFFSET / E por punto jugado en pista                  (deriva «sin balón»; sin aviso)
     + objetivos de la prueba (TRIAL_GOAL, con aviso)
K = (40 / E) × KAPPA × rol         rol = 1 en la playa y RATE6[puesto] en la pista
E = puntos esperados del partido (o de lo que queda de él al entrar desde el banquillo; ver 3.5)
soft(x) = techo suave de hoy por encima de 8,5; suelo suave por debajo de 3 (3 − 1,5·(1 − e^(−(3 − x)/1,5)));
          clamp 0-10 (en la práctica ≥ 1,5)
```

Esto es `rating()` de hoy desplegado en el tiempo. `5,4 + resultado` pasa a ser `6,0 − OFFSET + equipo + RES` (con
OFFSET = 0,6 la cuenta sale igual de media). El 40/puntos de hoy pasa a 40/E, con E fijado al empezar. La deriva hace que, si el
balón no te llega, la nota vaya de 6,0 a ~5,4 a lo largo del partido, como en la anécdota de FC.

### 3.2 Tabla de acciones (W base = los pesos de RATE_W de hoy; las nuevas, marcadas)

| id | texto del aviso | W | cuándo (lo decide `Rating.feed` con los eventos) |
|---|---|---|---|
| `ace` | Ace | +0,20 | `point` de tu equipo, `how:'ace'`, y el saque fue tuyo |
| `kill` | Remate ganado | +0,055 | `point` de tu equipo, `how:'kill'`, y tu remate fue el último ataque |
| `tip` | Dejada ganada | +0,055 | igual, con `how:'tip'` |
| `block` | Bloqueo punto | +0,20 | `point` de tu equipo, `how:'block'`, y el bloqueo fue tuyo |
| `assist` | Asistencia | +0,045 | `point.assist` es tu jugador (o, sin el campo, tu 2º toque antes del remate punto del compañero) |
| `dig` | Defensa | +0,035 | `hit` tuyo con `dig` |
| `recvP` | Recepción perfecta | +0,03 | `hit` tuyo con `recv` y `grade:'perfect'` |
| `perfect` | (sin aviso) | +0,02 | `hit` humano tuyo con `grade:'perfect'` |
| `poor` | (sin aviso) | −0,015 | `hit` humano tuyo con `grade:'poor'` |
| `srvErr` | Error de saque | −0,17 | `point` del rival con `reason:'serve'` y `player` tuyo, o con `how:'error'` cuando tu saque fue el último toque |
| `atkErr` | Remate fuera | −0,17 | `point` del rival, `how:'error'`, el último toque fue tu remate o tu dejada (out/antenna/under/net) |
| `net` | Toque de red | −0,17 | `point` del rival, `reason:'net'`, `player` tuyo |
| `dbl` | Dobles | −0,17 | `reason:'double'`, `player` tuyo |
| `four` | Cuatro toques | −0,17 | `reason:'four'`, `player` tuyo |
| `pos` | Falta de posición | −0,17 | `reason` position, backBlock, block (bloquear el saque) o attackServe, con `player` tuyo |
| `err` | Error | −0,17 | `point` del rival, `how:'error'`, tu último toque, y no encaja en ninguno de los anteriores |
| `blocked` **(nueva)** | Te bloquean | −0,06 | `point` del rival, `how:'block'`, y el remate bloqueado fue tuyo |
| `recvErr` **(nueva)** | Recepción fallida | −0,08 | `point` del rival, `how:'ace'`, y tocaste el saque tú (recepción) |

Errores, faltas y la diferencia de `err` reproducen lo que hoy cuenta `errors` (las faltas personales, y los puntos del rival con
`how:'error'` cuyo último toque fue tuyo). Las dos nuevas restan algo que hoy no cuenta. Empiezan pequeñas y el calibrado (§4)
decide si se quedan, si cambian o si se ponen a 0.

**Puesto:** en la pista, `rol = RATE6[puesto]`, igual que hoy, y la tabla es la misma para todos. Queda abierto (no hace falta
para esta versión) un `ROLE_W[pos][id]` que, por ejemplo, dé más peso a `assist` del colocador y a `recvP`/`dig` del líbero.

**Equipo y resultado** (con E = puntos esperados):

| | playa / pista (al mejor de 3 o de 5) | prueba (1 set) |
|---|---|---|
| punto ganado / perdido con tu jugador en pista | ±TEAM_PT/E, con TEAM_PT = 1,6 (sin aviso) | igual |
| set ganado / perdido (aviso «Set ganado» / «Set perdido») | +0,20 / −0,15 | +0,30 / −0,10 |
| partido ganado / perdido (aviso «Victoria» / «Derrota») | +0,20 / −0,10 | +0,30 / 0 |

Cuenta de comprobación en la playa (E ≈ 80, TEAM_PT/E = 0,02). 2-0 con +12 puntos: 0,24 + 0,40 + 0,20 = **+0,84** (hoy +0,9).
2-1: ≈ +0,05 + 0,25 + 0,20 = **+0,50** (hoy +0,6). 1-2: ≈ −0,02 − 0,10 − 0,10 = **−0,22** (hoy −0,3). 0-2 con −12: −0,24 − 0,30 −
0,10 = **−0,64** (hoy −0,6). En la prueba (E = 26, TEAM_PT/E ≈ 0,06): 15-10 da 0,3 + 0,3 + 0,3 = **+0,9** (hoy +0,9); 10-15 da −0,3
− 0,1 = **−0,4** (hoy −0,3).

Los sets y el partido solo cuentan si estabas en pista en algún momento del set. Si te quedas en el banquillo, la nota se congela.

### 3.3 Valores de partida de E (puntos esperados), que el calibrado ajusta

`E(o)` = puntos por set (≈ 1,75 × puntos del set: 21 → 37, 25 → 44, 15 → 26) × sets esperados (al mejor de 3: 2 + 0,4 del 3º a
15; al mejor de 5: 3 + 0,5 del 4º + 0,3 del 5º a 15), con un mínimo de 24.

| formato | E de partida |
|---|---|
| Carrera de playa (21, 21, 15) | ≈ 84 |
| Carrera de pista (25 × 4, 5º a 15) | ≈ 162 (lo da `g.points` / `g.toWin`) |
| Prueba (1 set a 15, playa o pista) | 26 |

`ratingtest` mide la media real de puntos por formato con los bots y la guarda en `Rating.E_TABLE`. La fórmula queda solo de
reserva para formatos raros.

Tamaño de los avisos que salen con esto. Playa: remate ≈ +0,03, ace/bloqueo ≈ +0,1, error ≈ −0,08. Pista, receptor (K ≈ 0,74):
remate +0,04, ace +0,15, error −0,13. Prueba en la playa (K ≈ 1,54): remate +0,08, ace +0,31, error de saque −0,26. Prueba en la
pista, receptor (K ≈ 4,6): remate +0,25, ace +0,9, error −0,8. Esto último es igual que hoy (trialGrade ya escala así); con
`KAPPA_TRIAL` del calibrado se puede rebajar si se ve exagerado.

### 3.4 Avisos (lo que enseña el HUD)

Para no llenar la pantalla con +0,03, el aviso es **por punto**. Al llegar el `point`, `Rating` junta en una entrada del registro
todas tus acciones de esa jugada:

- `txt` = la acción con más |δ| de la jugada (p. ej. «Remate ganado»), `d` = suma de tus δ de la jugada (sin la parte del equipo
  ni la deriva), `id` = id de esa acción.
- La cifra se redondea a un decimal. Si sale 0,0, el aviso va sin cifra, solo con la flecha: «▲ Remate ganado». Una jugada sin
  acciones con aviso (solo `perfect`/`poor`) no genera aviso.
- Set, partido y objetivo de la prueba: un aviso aparte cada uno («+0,2 Set ganado», «+0,3 Objetivo: 2 remates ganados»).
- Cifras siempre con coma y con el signo menos de verdad: «+0,3», «−0,2» (`Rating.fmt`).

### 3.5 Pista con cambios (titularidad)

- Solo cuentan las acciones, los puntos de equipo y la deriva **con tu jugador en pista** (`M.on`; la sim manda
  `sub`/`lineup` con `meIn`/`meOut`).
- **Entrar desde el banquillo:** con `meIn`, `Rating.rescale(st, Eleft)` vuelve a fijar K, la deriva y TEAM_PT con
  `Eleft = max(24, E − puntos ya jugados)`. Así una salida de 30 puntos pesa como hoy, que normaliza con `meR`.
- `NOTA_MIN_R = 12` sigue igual. Con menos de 12 puntos en pista, la nota final es `null` («s. c.»). En directo, la píldora se ve
  atenuada con «s. c.» hasta llegar a 12.
- Los partidos *legacy* (sin eventos de cambio ni `g.meR`) dan nota siempre, como hoy.

### 3.6 Lo que no cambia

- Los partidos simulados (`simulateNext`, `simulateNext6`, `benchNext*`, `trialSimOn`) conservan sus fórmulas. No hay nada en
  directo.
- La sim no se toca: `rating.js` solo lee eventos, no usa `g.rng` ni escribe en `g`. **Las huellas (fp-2v2, fp-mastery,
  fingerprint6) no pueden cambiar.** Si cambian, es un fallo.
- `rating()` se queda en career.js como **referencia**: es el respaldo si `VB.Rating` no está cargado (varias herramientas cargan
  career.js sin rating.js) y la vara con la que se mide el calibrado.

---

## 4. Calibrado (que la distribución se parezca a la de hoy)

**Objetivo**, sobre los mismos partidos, comparando `rating()` de hoy (con M) con la nota en directo:

| medida | tolerancia |
|---|---|
| media por bot y formato (novato, medio, bueno; playa Regional T1; pista receptor contra Normal; prueba) | ±0,15 |
| desviación típica | entre ×0,85 y ×1,15 de la de hoy |
| p10 y p90 | ±0,3 |
| correlación de rangos partido a partido (Spearman) | ≥ 0,85 |
| dieces | 0, como hoy |
| notas < 4 | como mucho 2 puntos porcentuales más que hoy |
| prueba: reparto de letras A+/A/B/C/D/F del bot medio | ±5 puntos porcentuales por letra (y el aprobado A+/A/B, ±4) |

Referencia de hoy: novato 6,14, medio 7,78 y bueno 9,10 (playa); receptor ~7,3 contra Normal (pista).

**Cómo se mide** (`tools/ratingtest.js`, modo `RATINGTEST_CAL=1`):

1. **Grabar.** Partidos sin cabeza con la sim entera. Playa: tú con la media inicial (35) y un compañero +3 contra clubes 28/34/40
   en Fácil, roles atk/cr, como el bloque «Carrera Regional» de simtest (l. 2271). Bots `novato`, `medio` y `bueno` de
   simtest: ratingtest carga el trozo de `tools/simtest.js` desde `const BOTS = {` hasta justo antes de `function topWhy(`, con
   `vm` y `S`, `C`, `DT` en el contexto, sin `require` (ese fichero no es un módulo). Si el trozo no carga, usa `autopilot` y lo
   avisa. Pista: `makeBot(…, { six: true })` de receptor contra Normal, a sets de 25 y a 15. Prueba: 1 set a 15, en playa y en
   pista. Unos 20-30 partidos por casilla. Para cada partido se guardan los eventos ya resueltos (cada `player` traducido a
   0/1/−1 con el `slotOf` de career.js) en `tools/out/rating-cal/*.json`, y también la nota de hoy (`ingest` + `rating`/`trialGrade`).
2. **Repetir sin la sim.** Como `Rating` es puro, cada partido grabado se vuelve a pasar por `Rating.feed` en milisegundos. Se
   prueba una rejilla de `KAPPA` (0,8-1,2), `OFFSET` (0,4-0,8), `TEAM_PT` (1,2-2,0), las parejas de RES, W de `blocked`/`recvErr`
   (0 / 0,03 / 0,06 / 0,1) y `KAPPA_TRIAL`. Se elige la combinación que cumple la tabla con menos error cuadrático de media y p10/p90.
3. **Fijar.** Los valores quedan como constantes en rating.js con un comentario de medida, al estilo de career.js («Medido el
   …: novato 6,1x, medio 7,7x…»), y una fila nueva en notes/carrera.md §Nota.
4. **Comprobar** que no se ha movido lo que depende de la nota. Con `careertest` (8 temporadas) las notas simuladas no cambian
   (no usan Rating), así que lo que se mira es que los retos de nota de career-life (6,0-8,6 por puesto) siguen al ~50 % de
   cumplimiento con el bot medio, y que `IMPACT_COACH` (nota ≥ 7 al entrar) sigue saliendo en un número parecido de salidas desde
   el banquillo.

Sin `RATINGTEST_CAL`, ratingtest solo hace las pruebas rápidas (§6.2) y acaba en «TODO OK».

---

## 5. La prueba se gasta al reiniciar o abandonar

### 5.1 Reglas

- **Empezar el partidillo es jugarlo.** Desde que `trialSetup` devuelve la partida, si sales antes del `gameOver` (con
  «Reiniciar», con «Abandonar la prueba», o cerrando o recargando la pestaña) la prueba queda **suspendida**: se quita la oferta,
  se apunta `c.pick.fail`, y si no quedan ofertas llegan otras. Es lo mismo que sacar D o F.
- Resultado guardado: `c.pick.res = { letter: 'F', nota: v | null, pass: false, sim: false, club, forfeit: 'restart' | 'quit' |
  'left', goals: [{id, ok: null}] }`, donde v es la nota en directo en ese momento (solo informativa).
- **Mensaje del agente:** «Prueba no superada: dejaste el partidillo a medias y <club> no te espera. Aún tienes N ofertas.»
- **Cierre de la pestaña:** `trialSetup` marca `c.pick.trial.live = 1` al guardar. Si se encuentra una prueba con `live` y no hay
  partidillo en marcha (al abrir la fase pick, o al llamar a `trialSetup`, `acceptOffer`, `trialSim` o `rejectAll`), se resuelve
  como `forfeit: 'left'`. `trialDoneOn` y `trialForfeit` borran `c.pick.trial`.
- **Migración:** las pruebas pendientes de antes (`c.pick.trial` sin `live`, guardadas con 1.2.0) **no** se gastan. Se pueden
  jugar una vez más con la regla nueva (al empezarlas se marca `live`). La etiqueta «A medias» solo se ve en ese caso.
- `tries` se queda por compatibilidad, pero no sirve para nada (siempre 1).

### 5.2 Interfaz

- **Antes de empezar** (ficha de la prueba, career-ui.js l. 1506): «… Si reinicias o abandonas, pierdes la prueba.», en lugar de
  «no pierdes». En `trialLine` (l. 942) se añade «Si la dejas a medias, la pierdes.».
- **Pausa durante la prueba:**
  - Antetítulo: `pauseKicker` con un trozo más, «Si reinicias o abandonas, pierdes la prueba», en una línea `.p-warn` pequeña.
  - `btnRestart`: «Reiniciar prueba». La 1ª pulsación cambia el texto a «Toca otra vez: pierdes la prueba» / «Pulsa otra vez:
    pierdes la prueba» durante 2 s (`restartArm`, como hoy). La 2ª resuelve `forfeit:'restart'`.
  - `btnQuit`: «Abandonar la prueba», también con dos pulsaciones (hoy es una sola): «Toca otra vez: pierdes la prueba». La 2ª
    resuelve `forfeit:'quit'`.
  - En los dos casos, después: `toMenu` → `CareerUI.open('pick', { trialRes })`, con el resultado arriba («Prueba suspendida:
    la dejaste a medias»).
- **Partidos normales de Carrera:** reiniciar y abandonar siguen como hoy (la jornada no se gasta). Al reiniciar, la nota en
  directo vuelve a 6,0.

---

## 6. Reparto del trabajo

### 6.1 API de `js/rating.js` (VB.Rating, nuevo, puro, sin DOM ni `g.rng`; PARTE A)

```js
VB.Rating = {
  START: 6.0, OFFSET, TEAM_PT, KAPPA, KAPPA_TRIAL, RES: { match: {...}, trial: {...} }, E_TABLE,
  ACTS: { ace: { txt: 'Ace', w: 0.2, toast: true }, ... },           // la tabla de §3.2
  E(o),                       // puntos esperados: o = { hall, points, toWin, trial }
  create(o),                  // → st. o = { hall: bool, pos: 'OH'|…|'atk'|'cr'|'uni', points, toWin, trial: bool, on: bool }
                              //   st = { v, raw, K, E, on, meR, seq, log: [], acts: {id: {n, d}}, done: false, _t: {…seguimiento…} }
  feed(st, e, who),           // un evento de la sim; who(player) → 0 tu jugador | 1 compañero/equipo | -1 rival.
                              //   Devuelve cuántas entradas nuevas hay en st.log (0 casi siempre). Ignora tipos que no conoce.
  bonus(st, id, d, txt),      // suma fuera de la tabla (objetivos de la prueba) con su aviso
  setOn(st, on, playedSoFar), // entrar o salir de pista (on = true reescala con Eleft, §3.5)
  close(st, res),             // final idempotente: aplica el resultado si no llegó por eventos.
                              //   → { nota, raw, best: [{id, txt, n, d}] ×3-5, worst: [...] ×3-5, acts }
  value(st),                  // round1(soft(START + raw))
  soft(x), fmt(d)             // fmt(0.3) → '+0,3'; fmt(-0.2) → '−0,2'; fmt(0) → ''
};
// entrada de st.log: { seq, kind: 'play'|'set'|'match'|'goal', id, txt, d (redondeado a 0,1), v (nota tras el aviso) }
// st.log guarda solo las últimas 8 entradas; st.acts lleva los totales por acción para la hoja final
```

Determinismo: misma lista de eventos → mismo `st`. Sin `Date`, sin `Math.random`, sin tocar `g`.

### 6.2 PARTE A: js/rating.js (nuevo), js/career.js, tools/careertest.js, tools/ratingtest.js (nuevo), index.html, tools/build-pages.js

1. **js/rating.js:** el módulo de §6.1, con cabecera y comentarios al estilo de career.js.
2. **index.html:** `<script src="js/rating.js"></script>` justo antes de `js/career.js`. Nada más. tools/build-pages.js ya copia
   todos los `js/*.js`, así que no hace falta tocarlo (comprobarlo).
3. **js/career.js:**
   - `newM(g)`: si existe `VB.Rating`, `M.rt = VB.Rating.create({ hall: g.size === 6, pos: g.ctrlRole || (g.career && g.career.role)
     || 'uni', points: g.points, toWin: g.toWin, trial: !!(g.career && g.career.trial), on: M.on })`. `matchSetup` y `trialSetup`
     (playa) pasan `career.role = c.player.roleKey`.
   - `ingest`: tras el bloque de cada evento, `if (M.rt) VB.Rating.feed(M.rt, e, who)` con `who = pl => slotOf(g, pl)`, pero −1
     para el rival. Con `sub`/`lineup` y `meIn`/`meOut`: `VB.Rating.setOn(M.rt, M.on, M.rallies)`. En la prueba, después de cada
     `point`, se miran los objetivos `>=` sobre `M.p[0]`: la primera vez que uno se cumple, `bonus(st, 'goal', TRIAL_GOAL × K',
     'Objetivo: ' + txt)`, donde K' = 1 (el objetivo vale 0,25 como hoy). Los objetivos `<=` se suman en el cierre si se cumplen.
   - **`liveRating(g)`** (nueva, también en BEACH, HALL y la fachada C): → `null` si no hay M, `M.g !== g` o falta `M.rt`. Si no,
     devuelve un objeto reutilizado `{ v, on, sc, seq, log, trial }`, donde `sc` = pista no legacy con meR < NOTA_MIN_R, `seq` =
     el último seq y `log` = `M.rt.log` (solo lectura).
   - `matchDone`: `mine.nota = M.rt ? VB.Rating.close(M.rt, res).nota : rating(...)`. `matchDone6`: lo mismo, respetando
     NOTA_MIN_R. Las dos añaden `sum.rt = { nota, best, worst }` a lo que devuelve `closeMine`/`closeMine6` (via `extra.rt`, en
     `c.last` pero **no** en `c.notes`).
   - `trialGrade(c, me, res, rallies, goals, rt)`: con `rt`, `base = close(rt).nota − bonos de objetivos ya sumados` y
     `nota = round1(min(10, base + TRIAL_GOAL × met))`, y devuelve también `rt: { best, worst }`. Sin `rt`, como hoy (las pruebas
     de careertest siguen pasando). `trialDoneOn` le pasa `m.rt`.
   - **`trialForfeit(i, why)`** (BEACH y HALL; en la fachada `trialForfeit(mode, i, why)`): si `trialOffer(c, i)` y
     `c.pick.trial` es de esa oferta → `trialResolve(c, i, false, { letter: 'F', nota: rt ? value : null, goals (ok null), sim:
     false, forfeit: why })` con el mensaje de §5.1. Devuelve `{ trial: true, forfeit: why, letter: 'F', nota, pass: false, luck:
     false, goals, met: 0, club, clubName, left, sim: false }`, o `null` si no había prueba (en ese caso, nada).
   - **`trialPending()`** → `{ club, offer, live }` o `null`. **`trialStale()`**: resuelve `live` como `'left'` (§5.1). Lo llaman
     `trialSetup`, `acceptOffer`/`acceptOffer6`, `trialSim` y `rejectAll`, y lo puede llamar CareerUI al abrir pick.
   - `trialMark`: `live: 1`. La cabecera de la sección de la prueba se reescribe: «Reiniciar o abandonar la gasta».
   - `trialResolve`: guarda `forfeit` en `c.pick.res` y usa el texto del agente propio.
   - Sin `VB.Rating` (herramientas que no lo cargan), todo sigue como hoy.
4. **tools/careertest.js:** añadir `js/rating.js` a `FILES` antes de career.js. Pruebas nuevas:
   - partido falso con eventos: la nota en directo empieza en 6,0, el ace sube, el error de saque baja, y `sum.nota === close().nota`;
   - pista con menos de 12 puntos en pista → `null`;
   - `liveRating` es `null` fuera de partido;
   - `trialForfeit` quita la oferta, deja `c.pick.res.forfeit` y genera ofertas nuevas si no quedan;
   - pendiente con `live` + `trialStale` → suspendida; pendiente sin `live` (guardado viejo) → no se gasta;
   - sin rating.js (`NORATING=1`), la nota es la de `rating()`.
5. **tools/ratingtest.js (nuevo):** pruebas rápidas de la tabla, `fmt`, `soft` (0-10, techo como hoy), determinismo (dos pasadas
   iguales), avisos por jugada (redondeo y sin cifra), `setOn`/`rescale`, cierre idempotente y equivalencia aproximada con
   `rating()` en 20 partidos de autopilot. Con `RATINGTEST_CAL=1`, el calibrado de §4. Abre Chrome: **no**.

### 6.3 PARTE B: js/main.js, js/ui.js, js/career-ui.js

1. **js/main.js**
   - `startMatch` (rama de Carrera, l. 454): con `g.career.trial` y el estado en pausa o jugando, en lugar de
     `startCareerTrial` → `careerEnd = Object.assign({ trial: true }, K.trialForfeit(mode, offer, 'restart') || { none: true })` y
     `toMenu()`.
   - `toMenu`: con `trialC` y sin `careerEnd` → `trialE = K.trialForfeit(trialC.mode, trialC.offer, 'quit')` antes de
     `abortMatch`, y abre `pick` con `trialRes: trialE`.
   - Comentarios de l. 452, 621-624 y 763-765: «reiniciar o abandonar gasta la prueba».
   - `careerEndSheet`: si `s.rt` existe, la línea de la nota pasa a ser un bloque `.end-rt`:
     - a la izquierda, la nota grande con el color de su franja (§6.4) y «Empezaste en 6,0» en pequeño;
     - a la derecha, dos filas de pastillas: «Lo mejor» (hasta 3: «3 × Ace +0,3») y «A mejorar» (hasta 3: «2 × Error de saque
       −0,3»), con `sepHTML`/`sep` de la guía;
     - la XP se queda en su línea. «s. c.» como hoy.
     - Tiene que caber a 844×390 y a 667×375 (el problema de siempre: «Menú principal» se sale). Si no cabe, se quita «A mejorar»
       antes que la XP.
   - `trialEndSheet`:
     - con `s.forfeit`: título «Prueba suspendida», letra F y «Dejaste el partidillo a medias: <club> no te espera. Te quedan N
       ofertas.»;
     - con `s.rt`: una fila «Lo mejor / A mejorar» compacta bajo los objetivos;
     - y la explicación de la nota: «Nota del partido 6,4 + 0,5 de objetivos».
   - Escena de depuración `?debug=trial`: añadir `rt` falso a `trialDbg`, y un `&tf=2` para el caso suspendida.
2. **js/ui.js**
   - **Píldora de la nota en directo:** la crea `hud()` la primera vez (no index.html), dentro de `#hud` y justo debajo del
     marcador `#sb`, alineada a su borde. Se ve solo con `g.career && !g.demo && !g.drill && VB.Career.liveRating(g)` no nulo.
     - Contenido: «NOTA» en pequeño + la cifra (`6,8`). Se reescribe solo si cambia (como `setText`).
     - Clases por franja de la nota (§6.4).
     - Fuera de pista (banquillo) o con `sc`: atenuada y con «s. c.» pequeño.
   - **Avisos:** cuando `liveRating.seq` es mayor que el último visto, se coge la entrada nueva de `log`. Se ve un aviso a la vez,
     pegado a la píldora: «+0,3 Ace» en verde o «−0,2 Error de saque» en rojo; sin cifra, «▲ Remate ganado». La cola es de 2 como
     mucho y cada aviso dura 1,6 s (con más en cola, 1 s). Con «reducir movimiento», sin deslizar. No salen durante la
     presentación (`ctx.introLeft > 0`) ni con el juego congelado; la píldora salta de valor sin animación.
   - **Accesibilidad:** la píldora lleva `aria-label="Nota 6,8"` y no es *live*. Solo los avisos de set y de partido van al
     `#banner` polite que ya existe, para no saturar el lector de pantalla.
   - **Pausa:** el antetítulo lleva un trozo más con la nota («Nota 6,8»). En la prueba, la línea `.p-warn` y los botones de §5.2
     (`renderPause` cambia los textos con `g.career.trial`; `disarmRestart` restaura «Reiniciar prueba»). `btnQuit`, en la prueba,
     usa el mismo armado de 2 s (con su propio `quitArm` o reutilizando `restartArm` con el botón como clave) y en la 2ª pulsación
     hace `goMenu()`.
3. **js/career-ui.js**
   - **CSS** en su `<style>` (como `#end.career`):
     - `#rtLive` (píldora): móvil primero, alto ≤ 26 px a 390 de alto, la fuente de cifras del marcador, borde a la izquierda con
       el color de la franja;
     - `.rt-toast`;
     - `.end-rt`;
     - la línea de aviso de la pausa `.p-warn`.
   - **Textos de la prueba:** l. 938, 942 y 1506 (§5.2). La etiqueta «A medias» solo se ve con `trialPending()` sin `live`.
   - **Vuelta a pick** con `trialRes.forfeit`: aviso arriba, «Prueba suspendida con <club>: la dejaste a medias.».
   - Al abrir pick, `C().trialStale && C().trialStale()` antes de pintar.

### 6.4 Colores de la nota (los mismos en la píldora, el aviso y la hoja final)

| nota | franja | token |
|---|---|---|
| < 5,0 | mala | `--rt-bad` (rojo de error del juego) |
| 5,0-5,9 | floja | `--rt-low` (naranja) |
| 6,0-6,9 | normal | `--rt-mid` (blanco o gris del marcador) |
| 7,0-7,9 | buena | `--rt-good` (verde de «ok» del juego) |
| ≥ 8,0 | muy buena | `--rt-top` (el dorado de las insignias) |

Los tokens van en career-ui.js con los colores ya existentes. Contraste AA sobre el fondo del marcador.

### 6.5 Pruebas al acabar (de una en una las que abren Chrome; `node tools/clean.js` al final de cada tanda)

- PARTE A: `node tools/ratingtest.js`, `node tools/careertest.js`, `NOWORLD=1 node tools/careertest.js` y `node tools/simtest.js`
  (huellas iguales), más `RATINGTEST_CAL=1 node tools/ratingtest.js` para el calibrado.
- PARTE B, de una en una:
  - `tools/console.sh`;
  - `node tools/shot.js` de `?debug=trial` (aprobada, suspendida y `tf=2`) y de un partido de Carrera con la píldora y un aviso,
    a 390×844, 844×390 y 1280×720;
  - `node tools/drive.js` (el flujo de la Carrera).
- Si cambia una huella: parar y explicarlo. No debería cambiar ninguna, porque no se toca sim.js.

---

## 7. Pendiente o abierto (para Ferran)

1. ¿`blocked` y `recvErr` (restan algo que hoy no cuenta)? Las medirá el calibrado; si mueven la distribución, se quedan a 0.
2. Pesos por puesto en la pista (`ROLE_W`): quedan para otra vuelta. Hoy todos los puestos usan la tabla × RATE6.
3. La prueba de pista con aces a +0,9 es lo que hoy ya pasa con `trialGrade`. ¿Rebajarla con `KAPPA_TRIAL`?
4. Al cerrar o recargar la pestaña a mitad de prueba también se pierde. Es coherente con «empezar es jugarla», pero un cuelgue
   del navegador te la quita.
5. La nota de los simulados sigue con su fórmula: si la nota en directo de los jugados acaba más baja o más alta tras el
   calibrado, `simulateNext*` tendrá que moverse igual (6,1 de base).
