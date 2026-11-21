# notes/ambiente.md — «Ambiente de Carrera» (diseño e integración, 18-nov-2026; estado final en §9)

Petición de Ferran: «más ambiente de grada, discusiones con el árbitro, tarjetas, pique entre los equipos… incluso diálogos
según lo que pase. Así, no todo es el punto, sino que hay algo más de realismo».

Este fichero es el contrato entre los 3 paquetes (P1, P2, P3). Lo mantiene P1; P2 y P3 apuntan sus cambios en sus notes de
dueño (notes/arena.md, notes/audio.md, notes/sim.md, notes/players.md) y el integrador los lleva a CONTRACT.md al publicar.
Nadie edita CONTRACT.md, VB.VERSION ni CHANGELOG.

---------------------------------------------------------------------------------------------------------------------------
## 0. Principios (valen para todos)

1. **Solo partidos JUGADOS de Carrera** (`g.career && !g.demo && !g.autopilot && !g.career._debug`, también el partidillo
   de prueba `trial` pero en «tranquilo»). Partido rápido, Entrenamiento (`g.careerDrill`), Online (`g.netCr`/`net`),
   repeticiones (`e.replay`, `ctx.replay`) y demo: CERO cambios. Con «Ambiente de Carrera: Apagado» la Carrera queda
   exactamente como hoy.
2. **La sim no se entera salvo por 3 puertas explícitas** (P3, sim.js), todas detrás de `g.amb` (opción nueva
   `createGame({amb:true})` que solo pasa main.js con Carrera + ambiente ≠ apagado + sin autopilot):
   `Sim.holdFor`, `Sim.canPenalty`, `Sim.penalty`. Nunca `g.rng`. Sin `g.amb` son no-op → huella 2v2 idéntica
   (`node tools/simtest.js 10 12345 0` → 150 partidas, 1638 puntos, 565616 llamadas a g.rng).
3. **Todo pasa con balón muerto**: entre el `point` y el silbato de saque (`whistle{reason:'serve'}`). Nada empieza
   después del silbato; los bocadillos se apagan como muy tarde en el `hit{kind:'serve'}`.
4. **Azar propio**: `hash01(g.seed, n, sal)` (como consignas.js / recap.js `h01`). Misma semilla + mismas elecciones
   del jugador → mismo ambiente. Reloj del director = `g.time` (se para con la pausa, la revisión y la repetición).
5. **Comunicación por eventos `amb:*`**: P1 (director) los genera; main.js (P1) los añade al array `ev` del frame DESPUÉS
   de `RPL.onEvents` y de `careerEvents` (el grabador de repeticiones no los ve), igual que los `fx:*` de players.
   Arena, Audio, Players y UI los consumen en su `update/handle` de siempre. Cada módulo funciona aunque los otros no
   existan (todo con guarda) y acepta eventos sintéticos (para probar en paralelo).
6. **Móvil primero** (844×390, 667×375 apaisado): nada en la franja inferior (stick a la izquierda, botones a la
   derecha), nada sobre `#sb`, `.hud-btns`, `#chal`, `#coach`. Letra ≥ 12 px (los bocadillos 13 px). «Menos movimiento»
   (`ctx.reduceMotion`): solo fundidos, sin deslizar ni escalar, sin ola, gestos de grada a media amplitud.
7. **Rendimiento**: sin mallas nuevas pesadas. Grada = el mismo InstancedMesh con 2-3 uniformes más. Tarjeta = un quad
   de 2 triángulos reutilizado. Audio = unos pocos buffers más en el banco del Worker.
8. **Textos**: castellano, cortos (≤ 48 caracteres ideal, 64 máximo), género neutro, ordinales «1r/2º/3r», sin nombres
   reales (todo sale de la Carrera inventada), piques y vacile sí; insultos, palabrotas y violencia NO.

---------------------------------------------------------------------------------------------------------------------------
## 1. Reglamento que imitamos (FIVB vigente, resumido)

- **Conducta leve** (regla 21.1): no se sanciona; el 1r árbitro la corta con **amonestación verbal o con la mano a
  través del capitán de juego** (seña de llamar al capitán: `beckon`). Nada en el acta.
- **Escala de sanciones por mala conducta** (21.3), acumulativa en el partido:
  - **Tarjeta amarilla = advertencia**: sin punto, queda en el acta. Una por equipo y partido; la siguiente mala
    conducta de cualquiera del equipo ya es roja.
  - **Tarjeta roja = castigo**: punto y saque para el rival.
  - **Expulsión** (roja + amarilla juntas en una mano): fuera el resto del set. **Descalificación** (roja y amarilla
    separadas): fuera del partido. En el juego: casi imposibles (solo con roja previa del MISMO participante y mucho
    calor), y en 2v2 de playa NO existen (expulsar deja al equipo incompleto = partido perdido: no lo hacemos).
- **Sanciones por retraso** (16), por equipo: **advertencia por retraso** (seña 25, mano en la muñeca con la amarilla)
  y **castigo por retraso** (roja en la muñeca: punto al rival). Las usamos poco: cuando un equipo alarga la protesta.
- **Quién habla**: en pista, **solo el capitán de juego** puede pedir explicaciones al 1r árbitro (y solo con balón
  muerto). El entrenador NO puede protestar decisiones (puede pedir cambios y tiempos): si protesta, se le sanciona igual
  (tarjeta a «Entrenador»). En playa los **dos jugadores** pueden dirigirse a los árbitros con balón muerto.
- **Una protesta nunca cambia la decisión.** Solo el challenge (competición «top») puede revisarla.
- Una sanción entre sets se cumple al empezar el siguiente: en el juego **no damos roja si el punto cerró set o partido**
  (se queda en amarilla o verbal), así no hay castigos fuera de un set.

---------------------------------------------------------------------------------------------------------------------------
## 2. Qué verá el jugador (resumen de diseño)

### A) Grada viva
- **Local / visitante de verdad.** Hoy la grada siempre anima al equipo 0. Con ambiente: `home` = equipo local
  (`atHome ? 0 : 1`, `-1` neutral en finales de copa y finales del circuito). Fuera de casa la grada grande anima AL RIVAL
  y tú tienes un grupito de tu afición.
- **Reparto de la grada** `fans:[f0, f1]` (parte del público de cada equipo; el resto neutral): casa 0,55/0,15; fuera
  0,15/0,55; neutral 0,30/0,30. Playa: los mismos números × 0,8 (más público neutral).
- **Calor** `heat` 0..1 (se calcula al montar el partido, §5): base por competición (low 0,25, mid 0,35, high 0,45,
  top 0,55; playa −0,05) + derbi 0,25 + clásico 0,12 + final 0,25 / semi 0,15 + ascenso o descenso en juego 0,15 + rival
  personal o jefe 0,12 + revancha (te ganó la última vez o la final pasada) 0,10 + cumbre (los dos en el top-2) 0,10.
  Tope 1.
- **Reacciones** (siempre por encima de lo que ya hace audio.js `crowdReact`, ahora con `home`):
  - estallido por punto grande / racha / remontada de los suyos; gruñido de la grada local al punto rival;
  - **murmullo que baja a silencio tenso** antes de un saque de punto de set o de partido (`amb:hush`);
  - **pitada al saque rival** (silbidos que paran en el golpe de saque) solo fuera de casa o con el rival de visita y
    `heat ≥ 0,55` (`amb:whistles`): en derbi y final casi siempre, en partidos tranquilos nunca;
  - **cánticos y palmas rítmicas** de la afición que va ganando el impulso (racha ≥ 3, remontada, set ganado):
    «¡Va-mos!» (2 sílabas), «¡O-é, o-é!», palmas 3+2, «¡De-fen-sa!» cuando el rival tiene punto de set; bombo según calor;
  - **ola** como mucho una por set, cuando el local gana de 5+ y no hay tensión (nunca con «Menos movimiento»);
  - **pitada al árbitro** cuando una decisión dudosa perjudica al local o cuando sacan tarjeta a uno de los suyos;
  - **silencio** durante la revisión del challenge (ya existe; con calor, «¡uuuh!» al resultado).
- **Speaker / megafonía** (partidista, como en los pabellones): presenta, canta los puntos de set, anima al local.
- **LED**: nombres de club en vez de «LA CPU», «¡BIENVENIDOS!», «¡DERBI!», «¡VAMOS {CLUB}!», «PUNTO DE CASTIGO».

### B) Discusiones con el árbitro
- **Disparadores** (punto dudoso en contra de un equipo): bote al límite (`g.call.dist ≤ 0,10 m`) o mal pitado
  (`g.call.wrong`), «tocado» (`signal:'touched'`), red (`reason:'net'`/`netTouch`), antena, dobles, cuatro toques,
  invasión (`under`), challenge perdido (`challengeResult{overturned:false}`). Nunca la falta de saque de 8 s (5 en playa)
  ni un ace limpio.
- **Protestas automáticas** (IA): el capitán del equipo afectado, tu compañero/a de playa, tus compañeros de pista o el
  entrenador protestan a veces (más con calor y con decisión de verdad mal pitada). Gesto breve (brazos abiertos al árbitro
  / señalar el bote), bocadillo («¡Ha sido dentro!»), el 1r responde con seña (repite la señal, «calma» con las palmas
  hacia abajo, o llama al capitán) y bocadillo («Decisión tomada»).
- **Tu elección** (solo «Completo», solo si el punto dudoso es en contra de tu equipo y tu jugador está en pista, como
  mucho 2 veces por partido, separadas 8+ puntos, nunca con challenge disponible para esa decisión: ahí lo realista es
  pedir challenge): dos fichas «Protestar» / «Dejarlo», 2,4 s, por defecto «Dejarlo».
  - Mando/teclado: **CAMBIAR = Protestar**; GOLPEAR, SALTAR o aceptar = Dejarlo (y recortan la pausa como siempre, así
    quien aporrea para seguir nunca protesta sin querer). Táctil: tocar la ficha.
  - En pista, si NO eres el capitán, la ficha dice «Quejarte» (más riesgo: el reglamento solo deja hablar al capitán).
  - Si tu equipo ya tiene amarilla, la ficha avisa: «Protestar (ya tenéis amarilla)».
- **Consecuencias**: la decisión no cambia nunca. Protestar puede encender a tu afición (en casa) o a la grada rival
  (fuera: pitada), arriesga verbal/amarilla/roja, y la nota: amarilla −0,15, roja −0,35 (si la tarjeta es tuya).
  Dejarlo una decisión mal pitada: «Cabeza fría» +0,05 (una vez por partido) y cuenta para la deportividad de la temporada.

### C) Tarjetas
- Seña del 1r en la silla (brazo en alto con la tarjeta; retraso: en la muñeca), silbato corto, la grada reacciona
  («¡uuuh!» o pitada), **rótulo de TV** «TARJETA AMARILLA · Nº 7 Nombre · Protesta» (3 s, arriba en el centro, debajo
  del marcador), **marca en el marcador** (cuadradito amarillo/rojo junto al nombre del equipo, todo el partido).
- **Roja**: ~1,0 s después del rótulo, **punto de castigo** (Sim.penalty): marcador +1 al rival, saque para el rival
  (con rotación si cambia el saque), cinta «PUNTO DE CASTIGO». Puede dar punto de set (no lo cerramos nunca con castigo
  al cierre: §1).
- **Registro**: hoja final (apartado «Sanciones»), acta (casilla de sanciones con el código FIVB W/P/E/D y DW/DP para
  retraso, set y marcador), recap (titular si hubo roja), ficha de Carrera (tarjetas de la temporada y de la carrera,
  «Premio a la deportividad» al acabar la temporada sin tarjetas).
- **Frecuencia** (objetivo medido con ambientetest/arbitrotest, 200 partidos):
  - jugador que siempre «Deja»: tarjetas a tu equipo ≈ 0,08 por partido (casi todas a compañeros o entrenador), a ti ≈ 0,01;
    rojas a tu equipo ≈ 1 cada 40 partidos;
  - jugador que siempre protesta: amarilla cada 2-3 partidos, roja cada 8-10;
  - rival (IA): amarilla ≈ 0,08 por partido, roja ≈ 1 cada 50;
  - «Tranquilo»: la mitad de protestas automáticas y sin elección tuya.
  - Sanción de partido: NO en este sprint. Con 3 rojas en una temporada, mensaje «Aviso del comité» en la bandeja
    (anotar la suspensión de verdad en TRASPASO.md como idea).

### D) Pique entre equipos
- **Rivalidad persistente** `c.world.riv[clubId] = {h, w, l, why:[...], last:{season, wk, y, r}}` (h 0..1): sube con
  partidos apretados (+0,08), tarjetas (+0,1 por roja), finales (+0,2), derbi (base 0,3); baja ×0,6 al cambiar de
  temporada. Entra en `heat` (+0,2·h) y en las frases («Otra vez estos…»).
- **Derbi**: pista = misma ciudad (`k.city`); **clásico** = el rival de más `h` del mismo país con 3+ temporadas de cruces
  (o el líder histórico de la liga). Playa = no hay ciudad compartida: el «derbi» es el duelo con tu rival personal o el jefe.
- **Antes**: mensaje en la bandeja la semana del derbi / revancha / cumbre (una vez), previa con rótulo «DERBI»,
  «REVANCHA» o «CUMBRE» (recap STAKES), LED «¡DERBI!».
- **Durante**: celebraciones de cara a la red tras un bloqueo (`amb:taunt kind:'net'`), miradas por debajo de la red
  (`'stare'`), algún «shh» suave (`'shh'`, solo con calor ≥ 0,7; el 1r puede dar verbal por provocación: 15 %),
  frases del rival que pica («¡Aquí no pasa nada!»).
- **Después**: SIEMPRE saludo final (`amb:handshake`: frases de deportividad de los dos lados y, si players lo permite
  barato, choque de manos en la red).

### E) Diálogos
- **Quién**: tú (`me`, en las protestas), compañero/a de playa (`mate`), compañeros de pista (`team`, con su nombre de
  `opts.names`), tu banquillo (`coach`, rótulo «Banquillo»), rival que pica (`rival`: el rival personal, el jefe o el
  capitán rival), banquillo rival (`rivalCoach`), 1r árbitro (`ref`, rótulo «1r árbitro»), speaker (`speaker`, rótulo
  «Megafonía»), comentarista (`tv`, rótulo «TV», solo high/top: partidos televisados) y Faro (`faro`, solo si
  `mentorOn(c)`, como mucho 1 por partido).
- **Cómo se ven**: bocadillo pequeño sobre la cabeza del que habla si está en cuadro; si no, tira de subtítulo arriba en
  el centro (30 % del alto). Nunca durante el peloteo, nunca en la franja inferior. 1 frase por punto como mucho (+ la
  respuesta en las parejas pregunta/respuesta: protesta→árbitro, pique→respuesta).
- **Frecuencia**: «Completo» ≈ 1 frase cada 3-4 puntos (más en momentos grandes); «Tranquilo» solo prioridad ≥ 2 (punto
  de set/partido, tarjetas, final) y como mucho 1 por set aparte de tarjetas. Enfriamiento por hablante 3 puntos; una
  frase no se repite en las últimas 12; dentro de cada banco se elige con hash evitando las 2 últimas.

### F) Ajustes
- `ctx.settings.ambient`: `'full' | 'calm' | 'off'`, por defecto `'full'`. Ajustes › Juego, fila «Ambiente de Carrera»
  con «Completo / Tranquilo / Apagado» y ayuda «Grada, árbitro, tarjetas y diálogos en los partidos de Carrera».
- Cambiarlo en mitad de partido se aplica al siguiente partido (salvo «Apagado», que silencia diálogos y fichas al momento).

---------------------------------------------------------------------------------------------------------------------------
## 3. Flujo de un punto dudoso (línea de tiempo, segundos desde el `point`)

```
0,00  point (sim)                 → Arbitro.feed detecta la disputa (team que la sufre, kind, fuerza)
0,30  amb:say (opcional)           compañero/a: «¿Eso fuera?»
0,45  [tu elección] amb:choice      main: Sim.holdFor(g, 3.4, false); fichas 2,4 s  → amb:choiceEnd
      [IA] amb:protest              gesto 1,2 s + amb:say del que protesta
+0,80 amb:refTalk                   1r: 'explain' | 'calm' | 'verbal' (llama al capitán) + amb:say ref
+1,60 amb:card (si hay)             main: Sim.holdFor(g, 2.6, true)  (bloquea recortar)  rótulo + seña + grada
+2,60 roja → main: Sim.penalty(g, team, {card, pid})  → whistle{penalty} + point{reason:'penalty'} (hold nuevo)
```
Si el jugador recorta la pausa sin secuencia en marcha, el director tira las frases de prioridad < 2 pendientes.
Si el punto se anula por challenge (`challengeResult{overturned}`), `Ambiente.undo` cancela lo pendiente de ese punto
(las tarjetas ya mostradas se quedan, como en la realidad).

---------------------------------------------------------------------------------------------------------------------------
## 4. API y eventos (nombres exactos)

### 4.1 Eventos `amb:*` (todos llevan `amb:true` y `t = g.time`; los genera VB.Ambiente; main.js los mete en `ev`)

| evento | campos | quién lo consume |
|---|---|---|
| `amb:start` | `heat, home (-1/0/1), fans:[f0,f1], tags:[], mode:'full'|'calm', hall, level:'low'|'mid'|'high'|'top', names:[tuClub, rivalClub], short:[≤12, ≤12]` | Arena (reparto de grada, LED de bienvenida), Audio (mezcla, lado local) |
| `amb:hush` | `k 0..1, why:'setPoint'|'matchPoint'|'clutch'` (dura hasta el `hit` de saque) | Audio (baja el murmullo), Arena (grada quieta) |
| `amb:whistles` | `team` (el que saca y recibe la pitada), `k` (hasta el `hit` de saque) | Audio, Arena (`boo` de la otra afición) |
| `amb:chant` | `team` (afición que canta), `kind:'vamos'|'oe'|'palmas'|'defensa'|'nombre'`, `k, dur` | Audio, Arena (palmas rítmicas de esa afición) |
| `amb:wave` | `dur` | Arena (`wave`), Audio (crescendo) |
| `amb:boo` | `target:'ref'|0|1`, `by` (afición que pita: 0/1), `k, dur` | Audio, Arena |
| `amb:roar` | `team, k` (extra a crowdReact: remontada, punto salvado…) | Audio, Arena (`cheer`) |
| `amb:led` | `text` (MAYÚSCULAS, ≤ 22), `team:-1|0|1`, `dur` | Arena (`message`) |
| `amb:say` | `id, who:'me'|'mate'|'team'|'coach'|'rival'|'rivalCoach'|'ref'|'speaker'|'tv'|'faro'`, `name` (rótulo), `team:-1|0|1`, `pid` (id del atleta para anclar o -1), `text, dur (1,6-3,2 s), pri 0..3, key` | AmbienteUI (bocadillo), Audio (campanita si `who==='speaker'`), UI (`srSay`) |
| `amb:protest` | `id, team, pid (-1 = entrenador), role:'player'|'captain'|'coach', kind:'line'|'touch'|'net'|'antenna'|'fault'|'chal', human, k, dur` | Players (gesto), Arena (1r mira; entrenador: gesto en el banquillo), Audio (murmullo/pitada) |
| `amb:refTalk` | `team, pid, level:'explain'|'calm'|'verbal', dur` | Arena (seña del 1r: repetir señal / palmas abajo / `beckon` al capitán) |
| `amb:card` | `team, pid, num, name, who:'player'|'coach'|'team', color:'yellow'|'red'|'expel'|'dq'|'delayY'|'delayR', reason:'protesta'|'conducta'|'provocacion'|'retraso', set, score:[a,b], penalty:bool` | Arena (seña + tarjeta), Audio (silbato + grada), UI (rótulo, marcador, hoja), MatchStats/Acta (registro), Players (cabeza baja) |
| `amb:taunt` | `team, pid, kind:'net'|'stare'|'shh'|'fist', toward` (pid o -1) | Players (gesto), Audio (grada) |
| `amb:choice` | `id, kind:'protest', opts:[{k:'protest',label}, {k:'drop',label:'Dejarlo'}], def:'drop', dur:2.4, sub` (contexto: «Balón dentro, dicen») | UI (fichas) |
| `amb:choiceEnd` | `id, pick:'protest'|'drop', by:'player'|'timeout'|'skip'` | UI (quita las fichas) |
| `amb:handshake` | `win` (bool) | Players (saludo), Audio (aplauso) |

El castigo NO es un `amb:*`: es el `point` de la sim (abajo).

### 4.2 Evento nuevo de la sim (P3)
`point` con `reason:'penalty', how:'penalty', signal:'penalty', penalty:true, card:'red'|'delayR', text:'Punto de castigo'`,
`player: null`, `faultTeam: 1-team`, `faultPlayer: atleta sancionado o null`, `rallyHits:0, digs:0, highlight:0.2`,
`streak` (cuenta igual), `setWon/matchWon` (false siempre en la práctica, §1), `sideout`, `hold`. Antes, `whistle{reason:'penalty'}`.
Todos los consumidores de `point` deben tolerarlo: sin estadística de jugador, sin celebración, sin plano de héroe raro,
sin repetición, Rating/Career sin error ni remate.

### 4.3 VB.Ambiente (P1, js/ambiente.js; puro: sin DOM, sin g.rng, sin Math.random, sin escribir en g)
```
create(o) → st          o = { seed, hall, level, mode:'full'|'calm', trial, amb: cs.amb (§5), me:{name,num,pid}, mate:{name,num,pid}|null,
                              names:[[...],[...]] (pista), rivalP:{name,num}|null, boss:{nick}|null, faro:bool }
feed(st, e, g)           por evento de la sim (career.js ingest, como Consignas). Llama a VB.Arbitro.feed.
undo(st)                 punto anulado por challenge (career.js unpoint)
frame(st, g, dt, out, f) → ctl   cada frame (main.js). f = {intro, ff, bench, reduce}. Empuja amb:* en out y devuelve
                                  ctl (objeto reutilizado) = { hold:0, lock:false, penalty:-1, pcard:'', ppid:-1 }
choose(st, id, pick)     → bool   la elección del jugador ('protest' | 'drop'); main.js / ctx.actions.ambChoose
choiceOpen(st)           → id o 0
crowd(st)                → objeto reutilizado { on, home, fans:[f0,f1], heat, energy:[e0,e1], boo:[b0,b1], hush, chant:{team,kind,k}|null }
crowdOf(g)               → crowd(VB.Career.amb(g)) o null (Arena y Audio lo leen cada frame; null = como hoy)
sum(st)                  → { cards:[{team,pid,num,name,color,reason,set,score}], protests, drops, coldHead, lines, heat, tags, fair }
penaltyDone(st, ok)      main.js tras Sim.penalty (ok=false: la roja queda en el acta sin punto)
BANK, TRIG, PRI          datos (pruebas)
```

### 4.4 VB.Arbitro (P3, js/arbitro.js; puro, sin DOM ni g.rng)
```
create(o) → st          o = { seed, hall, level, heat, mode, capt:[pid0, pid1] (pista; -1 si no hay), meTeam:0 }
feed(st, e, g) → null | D   con el 'point' (lee g.call en ese mismo frame) o con challengeResult{overturned:false}.
                             D = { id, team (el que la sufre), kind, strength 0..1, wrong, offer (ofrecer elección al humano),
                                   auto: { pid, role } | null (protesta de la IA), canRed }
protest(st, D, who, human, canRed) → R = { res:'none'|'explain'|'calm'|'verbal'|'yellow'|'red'|'expel'|'delayY'|'delayR',
                                           card: {team,pid,num,name,who,color,reason} | null, penalty: -1|0|1 }
taunt(st, team, pid, heat) → R   (provocación: casi siempre 'none'; a veces 'verbal'; rarísimo amarilla)
undo(st)                  cancela la disputa pendiente
state(st)                 → { verbal:[n0,n1], yellow:[bool,bool], red:[n0,n1], byPid:{pid:{y,r}}, delay:[0|1|2, …] }
RATES                     probabilidades (tabla del §6), para calibrar en arbitrotest
```

### 4.5 VB.Sim (P3, sim.js; todo no-op sin `g.amb`)
```
createGame({ amb: true })          → g.amb = true (nada más cambia)
Sim.holdFor(g, s, lock) → bool     solo en g.mode==='point' y !g.finished: g.timer = max(g.timer, s), g.hold crece lo mismo
                                    (skipHold sigue midiendo bien); lock → g.holdLock = g.time + s y skipHold devuelve false
                                    hasta entonces
Sim.canPenalty(g) → bool           g.amb && g.mode==='point' && !g.review && !g.pendingSet && !g.finished && !g.subWait
Sim.penalty(g, team, {card, pid})  → evento point o null. Cierra la ventana de challenge de ese punto (g.call = null,
                                    g.cpuChal = null), suma el punto, cambio de saque y rotación, cambio de campo de playa /
                                    a los 8 del 5º, racha; emite whistle{penalty} y point{penalty}; nuevo hold. Sin g.rng.
```

### 4.6 Otros puntos de unión
- **VB.Career** (P1): `amb(g)` → st del ambiente del partido o null; `ambCtx(c, n)` → `cs.amb` (§5); en `ingest` crea
  `M.amb = VB.Ambiente.create(...)` si `g.career.ambient !== 'off'` y alimenta como a Consignas (y `unpoint` → `undo`);
  `matchDone` lee `VB.Ambiente.sum` → tarjetas de la temporada, rivalidad, bandeja, fama.
- **VB.Rating.sanction(st, color, txt)** (P3, rating.js): amarilla −0,15, roja −0,35 dentro de la nota con aviso
  «Tarjeta amarilla/roja» (NO la deshace el challenge). career.js (P1) la llama si la tarjeta es de tu jugador.
  «Cabeza fría» con el `VB.Rating.extra` de siempre.
- **ctx.actions.ambChoose(pick)** (P1, main.js) para la ficha táctil; **ctx.settings.ambient** (P1 DEFAULTS +
  loadSettings; P3 la fila de Ajustes).
- **VB.AmbienteUI** (P1, js/ambiente-ui.js): `init(ctx)`, `update(g, dt, ev)`, `clear()`, `rect()` (zona ocupada, px CSS o null).
- **VB.UI** (P3): `ambChoiceRect()` y `cardRect()` (px CSS o null) para que AmbienteUI no los pise; `srSay(t)` público.
- **VB.Players.gesture(p, kind, dur)** (P3, players.js): `'protest'|'pointSpot'|'calm'|'stare'|'shh'|'fist'|'net'|'headDown'|'handshake'`;
  players.js lo llama él mismo al ver `amb:protest/taunt/card/handshake`.
- **VB.Arena** (P2): `refCard(color, team)`, `refTalk(level, team)` (públicas además de los eventos; las usan refposes y
  las escenas de prueba).

---------------------------------------------------------------------------------------------------------------------------
## 5. Datos del partido: `cs.amb` (P1, career.js `ambCtx` + main.js `careerIntroData`)
```
cs.amb = { home: 0|1|-1, heat, fans:[f0,f1], tags: ['derbi'|'clasico'|'final'|'semi'|'ascenso'|'descenso'|'cumbre'|
           'revancha'|'rival'|'jefe'|'estreno'], city, venue (nombre de la sede), short:[tu club ≤12, rival ≤12],
           capt:[pid0|-1, pid1|-1] (pista, del acta), coach:[nombre|'', nombre|''], riv: h 0..1, mode }
cs.atHome  (bool; next() ya lo tiene)
cs.ambient = ctx.settings.ambient   (main.js, junto a cs.calls)
```

---------------------------------------------------------------------------------------------------------------------------
## 6. Probabilidades (punto de partida; las calibran arbitrotest y ambientetest)

Disputa (por `point`): bote con `dist ≤ 0,10` o `wrong` → fuerza 0,5-1 (wrong +0,3); `touched` 0,5; red/antena/invasión
0,4; dobles/cuatro 0,35; posición 0,3; challenge perdido 0,6. Se ignora si fuerza < 0,35.

Protesta automática (IA) = fuerza × (0,25 + 0,5·heat) × nivel (low 1,1, mid 1, high 0,9, top 0,8) × (calm 0,5);
enfriamiento 6 puntos por equipo. El que protesta: pista 70 % capitán, 20 % entrenador, 10 % otro; playa el que perdió el
punto (o su pareja).

Respuesta del 1r (`protest`), modulada por severidad del nivel (low 0,8 · mid 1 · high 1,1 · top 1,25) y +20 % si no
eras el capitán en pista o es protesta tras challenge perdido; −15 % si de verdad estaba mal pitado:

| estado del equipo | explain/calm | verbal | amarilla | roja |
|---|---|---|---|---|
| limpio | 55 % | 40 % | 5 % | — |
| con verbal | 30 % | 10 % | 60 % | — |
| con amarilla | 50 % (verbal «última») | — | — | 50 % (si `canRed`; si no, verbal) |
| con roja del mismo participante | 70 % | — | — | 30 % → expulsión solo en pista y con heat ≥ 0,8 (si no, roja) |

Retraso: si en el mismo punto protestan dos del mismo equipo (o el entrenador después del capitán) → advertencia por
retraso (`delayY`); repetido en el partido → `delayR`.

---------------------------------------------------------------------------------------------------------------------------
## 7. Banco de frases (muestra; P1 lo amplía a ≥ 6 variantes por disparador y hablante, ~300 frases)

Comodines: `{me} {mate} {rival} {club} {rivalClub} {city} {n} {set} {venue}`. Todo neutro de género.

- pre/speaker (casa): «¡Bienvenidos a {venue}!» · «¡Arriba ese {club}!» · «¡Hoy se llena la grada!»
- pre/speaker (derbi): «¡Derbi en {city}! ¡Que se oiga!» · «¡Esto es un derbi, afición!»
- pre/rival (derbi/revancha): «Hoy no os vais con nada.» · «La última fue suerte, ¿eh?» · «Otra vez vosotros…»
- pre/mate: «Disfrutemos, que esto es lo bonito.» · «Saque seguro y a jugar.» · «Hoy se gana con la cabeza.»
- racha propia/mate: «¡Seguimos, seguimos!» · «¡Esta racha no se toca!» · «¡Que no pare!»
- racha propia/speaker: «¡{n} seguidos! ¡Vamos!» · «¡Esto es un vendaval!»
- racha rival/coach: «Calma. Punto a punto.» · «Seguro en recepción y salimos.» · «Respirad. Esto se gira.»
- error tuyo/mate: «Siguiente. Esa ya pasó.» · «Tranqui, la próxima es tuya.» · «Olvídala.»
- 2 errores seguidos/coach: «Cabeza, {me}. Juega seguro.» · «Menos fuerza, más dirección.»
- error tuyo/rival (heat ≥ 0,5): «¡Gracias por el regalo!» · «¡Sigue así!» · «Muy amable.»
- gran remate/mate: «¡Qué bestia!» · «¡Eso no lo para nadie!» · «¡Toma ya!»
- gran remate/tv: «¡Qué potencia de {me}!» · «Remate imparable.» · «Eso va al resumen.»
- bloqueo tuyo/rival: «Vale, vale…» · «Me la guardo.»
- bloqueo rival/rival (pique): «¡Aquí no pasa nada!» · «¡Prueba otra vez!» · «Esta pared es nuestra.»
- bloqueo rival/mate: «Busca las manos, que se abren.» · «Juega la línea.»
- punto de set a favor/mate: «Esta es nuestra.» · «Una más y es nuestro.»
- punto de set en contra/coach: «Saque dentro. Sin regalos.» · «Aguantamos y salimos.»
- punto de partido/speaker: «¡Punto de partido! ¡Todo el mundo de pie!»
- punto salvado/speaker: «¡Salvado! ¡Aquí no se rinde nadie!»
- remontada/tv: «¡Remontada en marcha!» · «Partido nuevo en {venue}.»
- peloteo largo/speaker: «¡Qué punto! ¡Aplauso!» · «¡Eso es vóley!»
- entre sets/coach: «Les cuesta la diagonal. A por ella.» · «Saque al {n}, que sufre.» · «Mismo plan, más rápido.»
- protesta/me: «¡Ha sido dentro!» · «¡La ha tocado!» · «¡Eso es red!» · «¡Pero si se ve desde aquí!»
- protesta/mate (calma): «Déjalo, que nos lo cobran.» · «Venga, a por la siguiente.»
- árbitro/explain: «Decisión tomada.» · «Fuera. Lo he visto claro.» · «Juego.»
- árbitro/verbal: «Capitán, aquí, por favor.» · «Ni una más.» · «Aviso. El próximo, tarjeta.»
- tarjeta/tv: «Amarilla para {name}.» · «Roja. Punto para {rivalClub}.» · «El 1r no ha dudado.»
- castigo/mate: «Bueno, a recuperarlo.» · «Culpa mía. Lo arreglo.» (si la roja fue tuya)
- challenge perdido/mate: «Había que intentarlo.» · challenge ganado/mate: «¡Lo sabía!»
- Faro (1 por partido): «Respira. El siguiente punto es el único que importa.» · «Juega a tu vóley, no al suyo.»
- final/rival (siempre): «Buen partido.» · «En la vuelta, otra historia.» · «Bien jugado. Nos vemos.»
- final/speaker: «¡Gracias, afición!» · «¡Qué partidazo en {venue}!»

Filtro (ambientetest): lista de palabras prohibidas (insultos/palabrotas/violencia), comodines resueltos, longitud ≤ 64,
sin «o/a» ni «@», sin nombres reales (los de la Carrera vienen inventados).

---------------------------------------------------------------------------------------------------------------------------
## 8. Paquetes (ficheros disjuntos)

### P1 — Director del ambiente, diálogos, pique y cableado (dueño ui_main/carrera)
Ficheros: **js/ambiente.js** (nuevo), **js/ambiente-ui.js** (nuevo, crea su DOM `#ambSay` y su `<style>` desde JS como
career-ui), **js/main.js**, js/career.js, js/career-world.js, js/career-life.js, js/career-ui.js, js/career-world-ui.js,
js/career-life-ui.js, js/recap.js, **tools/ambientetest.js** (nuevo), tools/careertest.js / lifetest.js / worldtest.js /
recaptest.js si hace falta, notes/ambiente.md, notes/ui_main.md (sección «Ambiente», incluidos los 3 ficheros JS nuevos).
- main.js: `DEFAULTS.ambient = 'full'` (+ validación en loadSettings), `cs.ambient`, `careerIntroData` → `cs.amb =
  K.ambCtx(c, n)` y `cs.atHome`, `createGame({amb:true})` solo con `cs && ambient !== 'off' && !auto`, bucle: tras
  `careerEvents`, `ambFrame(g, gdt)` → `VB.Ambiente.frame(VB.Career.amb(g), g, gdt, AMBQ, f)`; aplicar `ctl.hold`
  (`Sim.holdFor`), `ctl.penalty` (`Sim.canPenalty` → `Sim.penalty` → `Ambiente.penaltyDone`); empujar AMBQ en `ev`;
  `VB.AmbienteUI.update(g, gdt, ev)`; con elección abierta, CAMBIAR = `choose('protest')` y GOLPEAR/SALTAR/aceptar =
  `choose('drop')` ANTES de `Sim.skipHold`; `ctx.actions.ambChoose`; nada con `ctx.replay`/`rpA`, intro (solo
  `amb:start`), `bench.ff` (el director sigue el marcador pero no abre disputas ni frases: sin tarjetas ni castigos mientras se salta).
  Escena de prueba `?debug=amb&k=choice|yellow|red|derby|boo|chant|lines` (dispara eventos sintéticos y un castigo real).
- career.js: `ambCtx`, `amb(g)`, enganche en `newM/ingest/unpoint` (saltar `e.penalty` en estadísticas y errores),
  `Rating.sanction`/«Cabeza fría», `matchDone` → `c.life.cards {s, y, r, tot:{y,r}, fair}`, rivalidad `c.world.riv`
  (career-world.js), mensajes de bandeja (derbi/revancha/cumbre antes; roja y comité después; deportividad al cerrar
  temporada), fama (roja −1, deportividad +1).
- recap.js: STAKES `derby` («DERBI», «{city} se paraliza»), `revancha`, `cumbre`, titular y frase con tarjeta/castigo.
- career-ui / career-life-ui: chip «DERBI» en el hub, tarjetas de la temporada en la ficha.
- Pruebas: ambientetest (determinismo; sim idéntica con ambiente apagado; frecuencias §2C; filtro de textos; sin frase
  repetida seguida; nada después del silbato de saque), careertest normal / NOWORLD=1 / NORATING=1, recaptest, lifetest,
  worldtest, simtest 2v2. Capturas (con cerrojo) de los bocadillos a 844×390 y 667×375.

### P2 — Grada viva y pabellón (dueños arena + audio)
Ficheros: **js/arena.js**, js/fx.js, js/venues.js / venue-*.js (solo si hace falta), **js/audio.js**,
tools/audiotest.js, tools/refposes.js, notes/arena.md, notes/audio.md.
- arena.js: grada con uniformes `uSplit` (vec2: umbrales de `aAnim.z` desde `fans`; sin ambiente 0,25/0,75 = hoy),
  `uHeat` (energía base), `uBoo` (vec2: gesto de pitada por afición, brazos adelante y cabeza que niega, barato), palmas
  rítmicas para `amb:chant`; lee `VB.Ambiente.crowdOf(g)` cada frame (null = como hoy). LED/videomarcadores con los
  nombres de club en Carrera (`teamFor/teamOf`), `amb:led`, «PUNTO DE CASTIGO». 1r: poses `card` (brazo en alto, mano
  cerrada), `cardWrist` (retraso), `calm` (palmas abajo), `beckon` ya existe; tarjeta = 1 quad de 2 triángulos
  reutilizado, color por uniforme, pegado a la mano del 1r. 2º: se acerca a la red/mira al banquillo en `amb:protest`
  de entrenador. Banquillo: `crewReact` con kind `'protest'` (entrenador brazos abiertos) y `'card'`. Señal `'penalty'`
  en `refSignal` (lado del que saca). `refCard()`, `refTalk()` públicas. «Menos movimiento»: sin ola, pitada a media amplitud.
- audio.js: `crowdReact` con `home` (sin ambiente: equipo 0 como hoy, audiotest igual), sonidos nuevos en el banco del
  Worker: `boo` (pitada: silbidos de aficionado + «uuuh» grave), `whistleStorm` (bucle corto para la pitada al saque),
  `chantVamos`, `chantOe`, `chantDefensa` (formantes de multitud con ritmo), `palmas32`, `paChime` (campanita de
  megafonía), `cardWhistle` (pitido corto y seco del 1r), `ohh` de tarjeta; `hush` (baja `murmur` 6-8 dB hasta el saque);
  bombo según calor; mezcla con `crowdVol`. Medir con audiotest (síntesis en node + partido en Chrome con cerrojo).
- Pruebas: audiotest, refposes (nuevas poses), perf.js 844x390 STRICT=1 (sin perder fps), capturas de la grada en casa,
  fuera y con pitada.

### P3 — Árbitro, protestas y tarjetas (dueños sim, players, ui_main parcial)
Ficheros: **js/arbitro.js** (nuevo), **js/sim.js**, tools/simtest.js, **js/players.js**, **js/ui.js**, **index.html**,
js/matchstats.js, js/acta.js, js/rating.js, js/replay.js, js/camera.js (solo una guarda si el plano de héroe del castigo
falla), **tools/arbitrotest.js** (nuevo), tools/settest.js, tools/actatest.js, tools/statstest.js, notes/sim.md,
notes/players.md.
- arbitro.js: §4.4 y §6.
- sim.js: `opts.amb`, `holdFor`, `canPenalty`, `penalty` (§4.5) + bloque en simtest «Castigo» (marcador, saque,
  rotación, cambio de campo, 0 llamadas a g.rng, no-op sin g.amb) y huella 2v2 idéntica.
- players.js: `gesture(p, kind, dur)` y reacción a `amb:protest/taunt/card/handshake` (reutiliza `noToque`, `pique`,
  `forceCel`; sin celebración para el `point` de castigo).
- ui.js + index.html: fichas de elección (`amb:choice`, centradas a media altura, 2 botones ≥ 44 px de alto, texto
  ≥ 14 px, fuera de la franja inferior, glifos de mando/teclado), rótulo de TV de tarjeta, cuadraditos en `#sb`, cinta
  «PUNTO DE CASTIGO», `srSay` de tarjetas y frases, hoja final «Sanciones», `ambChoiceRect()/cardRect()`; Ajustes ›
  Juego: definición `ambient: {vals:['full','calm','off'], labels:['Completo','Tranquilo','Apagado']}`, `TAB_KEYS.game`,
  fila en index.html; `<script>` de `js/arbitro.js` y `js/ambiente.js` justo después de `js/consignas.js` (antes de
  career.js) y de `js/ambiente-ui.js` justo después de `js/ui.js`. Subir `.co-call .co-k` NO (es de career-ui, P1).
- matchstats/acta: registrar `amb:card` y el punto de castigo (acta: sanciones con código FIVB, set y marcador).
- rating.js: `sanction()`; `point` de castigo sin acciones de jugador. replay.js: ignorar `point{penalty}` (sin rally,
  sin repetición automática).
- Pruebas: simtest 10 12345 0, fingerprint6, arbitrotest (frecuencias y escala FIVB), actatest, statstest, settest y
  replaytest (con cerrojo), capturas de fichas y rótulo a 844×390 / 667×375 con y sin «Menos movimiento».

### Cómo trabajar en paralelo sin esperarse
- Cada módulo funciona sin los otros (guardas). P2 y P3 prueban con eventos sintéticos:
  `VB.Arena._dbg().onEvents([{type:'amb:card', amb:true, team:1, color:'yellow', pid:-1}], VB.ctx.game)` o con
  `?debug=amb&k=…` cuando P1 lo tenga.
- Los nombres de este fichero mandan. Si alguien necesita un campo nuevo, lo AÑADE (nunca renombra) y lo apunta aquí en
  «Cambios al contrato» abajo.

---------------------------------------------------------------------------------------------------------------------------
## 9. Estado final tras la integración (18-nov-2026) — cómo funciona, frecuencias y escenas

Esto manda sobre §3 y §6 donde no coincidan (las críticas de juego y técnica del 18-nov cambiaron varias cosas).

### 9.1 Cómo funciona (de punta a punta)
1. **Antes del partido** — `main.js careerIntroData` pide `cs.amb = VB.Career.ambCtx(c, n, cs)` (local / visitante, calor, etiquetas
   derbi / clásico / final / semi / ascenso / descenso / cumbre / revancha / rival / jefe / estreno). Un derbi suma +0,25 al calor
   (y la rivalidad de `c.world.riv`, hasta +0,2). La previa de recap.js saca «DERBI» (pista), «REVANCHA» o «CUMBRE»; el hub, el chip.
   Con «Apagado» no hay `cs.amb` ni `cs.atHome`: la previa, la bandeja y `c.world` quedan como antes.
2. **Durante el partido** — career.js crea el director (`VB.Ambiente.create`) y le pasa cada evento de la sim (`ingest`, y `undo`
   con el punto anulado por challenge). El director crea su árbitro (`VB.Arbitro`) con los capitanes y tu atleta. main.js, cada
   frame y después del grabador de repeticiones, llama a `frame()`: los `amb:*` van al array del frame y `ctl` abre las puertas de la
   sim (`holdFor`, `canPenalty` + `penalty`). Arena (grada, LED, 1r árbitro), audio, players (gestos), ui (fichas, rótulo, cuadraditos,
   hoja) y AmbienteUI (bocadillos / subtítulos) consumen esos eventos; cada uno funciona sin los otros.
3. **Un punto dudoso** (todo con balón muerto, entre el `point` y el silbato de saque):
   - `Arbitro.feed` ve la disputa: bote a ≤ 0,10 m o mal pitado (`g.call`), «tocado» SOLO si lo último fue el bloqueo (`lastKind ===
     'block'`), red, antena, invasión, dobles / cuatro, posición o challenge perdido. `D.team` = el que SUFRE la decisión;
     `D.calledIn` = lo pitado en un bote.
   - Primero decide si protesta alguien de la IA (capitán / entrenador / otro en pista; el que perdió el punto en playa; nunca tú).
     Si nadie, y la decisión es de tu equipo, de línea o «tocado», sin challenge disponible y en «Completo», a veces te ofrece la
     elección (como mucho 1 por partido): fichas «Protestar» (o «Quejarte» si no eres capitán) / «Dejarlo», 2,4 s, por defecto Dejarlo.
     CAMBIAR = Protestar; GOLPEAR / SALTAR / aceptar = Dejarlo (y recorta la pausa); en táctil, se toca la ficha. Con la pausa las
     fichas se ocultan y vuelven al reanudar con el tiempo que les quedaba (el reloj del director es `g.time`).
   - La protesta: gesto + frase del que protesta (siempre desde el que la sufre: «¡Ha sido fuera!» si la pitaron dentro, «¡No la he
     tocado!» en un «tocado»…), respuesta del 1r (explicación, calma, verbal llamando al capitán o tarjeta) con su seña y su frase
     (`refYellow` / `refRed` separadas), pitada de la grada local si le perjudica. Protestar sin tarjeta no cambia el marcador (una
     protesta nunca cambia la decisión) pero tu equipo y tu grada se vienen arriba (`amb:roar` + frase `backUp`).
   - Escala FIVB acumulativa por equipo: verbal → amarilla (sin punto, una por equipo) → roja (punto y saque para el rival, con
     `Sim.penalty` 1 s después de la tarjeta; nunca si cerraría el set). Otra protesta del mismo equipo en el mismo punto es mala
     conducta más severa (×1,6), NO retraso: este árbitro no pita retrasos (los colores `delayY/delayR` siguen en el contrato). Sin
     expulsiones ni descalificaciones (obligarían a un cambio que la sim no hace y emPat rechazaría el acta).
   - La tarjeta sale en el rótulo de TV (arriba), en la mano del 1r (quad), cuadradito en `#sb`, frase de TV (high/top) o del
     compañero, `c.life.cards`, la nota (−0,15 / −0,35), el acta (sanción emPat), estadísticas, hoja final («Sanciones»), recap
     (titular `redCard`) y rivalidad. El punto de castigo sale en la pestaña de jugada (la cinta grande tapaba el marcador). Si el
     castigo no llega a darse (silbato de saque, avance rápido del banquillo), la tarjeta deja de decir «punto de castigo».
4. **Grada** — `crowdOf(g)` (null fuera de la Carrera o con «Apagado», también si se apaga a mitad de partido): local / visitante,
   calor, energía por equipo, pitada, silencio tenso, cántico en curso. En punto de set o de partido manda el silencio tenso (a veces,
   si se defiende el local con mucha afición, «¡De-fen-sa!» en su lugar); nunca pitada a la vez. La pitada al saque del visitante: solo
   con calor ≥ 0,55, ~1 de cada 10 saques y como mucho 2 por set. Ola: como mucho 1 por set, nunca con «Menos movimiento».
5. **Diálogos** — megafonía (local; neutral en finales), compañero/a, compañeros de pista, banquillo (solo pista: en playa lo dice tu
   pareja), rival, banquillo rival, 1r, TV (high/top) y Faro (1 por partido). Nombre de pila entre compañeros, banquillo y Faro;
   completo en megafonía y TV. Previa en la primera bola muerta: derbi de ciudad (pista), duelo (playa: rival personal o jefe; LED
   «¡DUELO!»), revancha o normal. Sin repetir una frase entre las últimas 12. Bocadillo sobre la cabeza o subtítulo al 30 % del alto;
   el subtítulo se aparta del balón y, con el sacador listo (`serveReady`), lo que le quede se corta a 0,9 s; los bocadillos no se
   ponen sobre el saque. Todo se borra en el golpe de saque.

### 9.2 Frecuencias medidas (circuito completo: sim real + bots de simtest + Carrera + director + VB.Arbitro)
Medido con `tools/out/ambiente/critica-jugador/freq.js` (copia en el scratchpad de la integración), partidos de Carrera mitad playa
mitad pista, niveles low-top, calor 0,30-0,45 salvo donde se dice. Por partido:

| política (partidos) | tarjetas a tu equipo | a ti | rojas | al rival | elecciones | protestas (los 2 equipos) | puntos por frase |
|---|---|---|---|---|---|---|---|
| siempre «Dejarlo», calor 0,30-0,45 (40) | 0,075 | 0 | 0 | 0,075 | 0,75 | 1,4 | 3,7 |
| siempre «Protestar», calor 0,30-0,45 (40) | 0,25 | 0,175 | 0 | 0,075 | 0,75 | 2,2 | 3,4 |
| siempre «Dejarlo», calor 0,9 (16) | 0,125 | 0 | 0 | 0,19 | 0,56 | 2,1 | 3,3 |

Antes de la integración (crítica de juego): rival 0,33-0,38 por partido, 2,00 elecciones por partido, 88 % de las protestas «tocado»
(ahora ~35 %, y solo de bloqueo). El 1r: en 40 partidos protestando siempre no salió ninguna roja (la roja necesita amarilla previa
del equipo; arbitrotest, con otra muestra, da ~0,03 por partido).

`tools/arbitrotest.js` (autopilot en los dos lados, solo VB.Arbitro) da menos disputas que el circuito (los bots de simtest atacan
más contra el bloqueo y sacan más «tocados»); sus bandas son anchas a propósito y el circuito es la referencia.

Objetivos: tarjetas a cada equipo ≈ 0,08 por partido si nadie fuerza; elección ≈ 0,5-0,7 por partido; protestando siempre, una
amarilla cada 3-5 partidos y la roja rara (solo con amarilla previa del equipo: ≤ 1 elección por partido hace imposible la «roja cada
8-10» del diseño, y es a propósito: 2 fichas por partido eran ~60 pausas iguales por temporada). Frases: 1 cada 3-4 puntos en
«Completo»; «Tranquilo» solo prioridad ≥ 2 (≈ la mitad) y sin fichas.

### 9.3 Escenas de depuración
- `?debug=amb` — partido de Carrera de mentira EN VIVO, la IA juega por ti, no toca ningún guardado. `&k=` `lines` (una frase en
  cada punto; por defecto) | `choice` (la 1ª disputa de bote en contra abre las fichas: `VB.ctx.actions.ambChoose('protest'|'drop')`)
  | `yellow` | `red` (tarjeta forzada en la 1ª disputa; la roja con su punto de castigo de verdad) | `derby` (calor 0,9) | `boo`
  (pitada al saque rival) | `chant` (cánticos). Más: `&format=6v6`, `&away=1`, `&final=1`, `&calm=1`, `&heat=`, `&level=`, `&seed=`.
- `?debug=intro&kind=long&career=1&derby=1` (o `&revancha=1`, `&cumbre=1`; `&t=4.4` congela donde se ve la etiqueta) — la previa.
- Poses del 1r: `node tools/refposes.js <dir> cardY,cardR,delayY,talkCalm,talkVerbal,talkExplain,penalty,coachProtest near,game`.
- Pruebas: `node tools/ambientetest.js`, `node tools/arbitrotest.js [n]`, bloque «Castigo» de `tools/simtest.js`; `tools/audiotest.js`
  (escenarios «ambiente: …», abre Chrome).
- Capturas finales: `tools/out/ambiente/final/` (844 táctil y 1280×720).

### 9.4 Pendiente (TRASPASO)
- Sanción de partido a las 3 rojas (hoy solo el aviso del comité), expulsiones y descalificación (necesitan cambio forzado en la sim).
- El audio del ambiente solo está medido con el motor falso de audiotest (Chrome headless no desbloquea el AudioContext).
- La elección con un humano de verdad está probada con teclado sintético (CDP) y el toque con `ambChoose`; falta en un móvil real.
- Más frases hacia ~300 por hablante clave (hoy 829 en 56 disparadores); una repetición automática que se corte también con una
  protesta que acaba en verbal.

## Cambios al contrato
- (P3, 18-nov) **Sentido de `team` en el castigo**: `Sim.penalty(g, team, o)`, `Arbitro.protest(...).penalty` y
  `ctl.penalty` llevan el equipo **SANCIONADO** (el de la tarjeta, como `amb:card.team`); el punto va a `1 - team`
  (`point.team = 1 - team`, `point.faultTeam = team`). `-1` = sin castigo.
- (P1, 18-nov) Hecho por P1 y ya aplicado: `ctl.penalty` = equipo SANCIONADO (lo de arriba); main.js llama a
  `Sim.canPenalty(g, ctl.penalty)` y `Sim.penalty(g, ctl.penalty, {card, pid})`.
- (P1) **VB.Ambiente, añadidos**: `create(o)` acepta además `rate(kind, v, txt)` (career.js: `'sanction'` con el color → `VB.Rating.sanction`
  o `extra`; `'cold'` → «Cabeza fría» +0,05), `force` (escena de prueba: `'choice'|'yellow'|'red'|'boo'|'chant'|'lines'`) y `main`.
  Funciones nuevas: `skip(st)` (main.js tras `Sim.skipHold`: tira las frases de prioridad < 2), `bind(g, st)` / `of(g)` (la escena
  `?debug=amb` ata su director a la partida; `crowdOf(g)` usa `of(g)`, que si no hay nada atado pregunta a `VB.Career.amb(g)`).
  `st.ff = true` lo pone main.js al empezar el avance rápido del banquillo (`ffRun`), antes de que lleguen sus eventos.
- (P1) **Eventos**: `amb:card` añade `id` y `mine` (la tarjeta es de tu atleta); `amb:protest.kind` nunca vale `'under'` ni
  `'position'` (van como `'net'` y `'fault'`); `amb:say.key` de la frase del compañero al abrir las fichas = `'sub/<kind>/<n>'`.
- (P1) **VB.Arbitro**: el director lo crea con la primera partida que ve (`capt` = pid del capitán en pista; `mePid` = tu atleta) y
  respeta su `D.offer` (si no hay js/arbitro.js usa su árbitro mínimo interno con la misma forma).
- (P1) **VB.Career**: `ambCtx(c, n, cs)` (3r argumento opcional: el `g.career` del partido, para duelo / jefe / acta / estreno);
  `cs.amb` añade `level` ('low'|'mid'|'high'|'top'). `matchDone` deja el resumen en `sum.amb` (= `VB.Ambiente.sum`) y en
  `g.career.ambSum` (titular de recap.js). `sum()` añade `myY`, `myR`, `teamR`, `choices`, `home`.
- (P1) **Guardado** (sin subir VER): `c.life.cards = {s, y, r, n, tm, tot:{y, r}, fair, warn}`; `c.world.riv[clubId] =
  {h, m, w, l, last:{season, wk, r:'W'|'L'}, why:[≤4]}` (≤ 40 rivales) y `c.life.rivMsg` (último mensaje de la semana enviado: derbi, revancha o cumbre; lo manda career-life.js para que career-world.js siga sin escribir en la bandeja).
  `sum.life.cards = {y, r, team}` y `sum.life.fair`. Lectura: `VB.CareerLife.cardsOf(c)`, `VB.CareerWorld.rivOf(c, id)`.
- (P1) **main.js**: `ctx.actions.ambChoose('protest'|'drop')` → true si había fichas abiertas. `MODS` incluye `'AmbienteUI'` (init,
  onGameStart, onState); su `update` va aparte, justo después de `UI.update`. `VB.AmbienteUI._state()` (pruebas).
- (P2, 18-nov) **Grada**: `uSplit` = parte del público NEUTRAL que se suma a cada afición (las camisetas no cambian: `aAnim.z` es
  0 / 0,5 / 1, no un continuo) y un uniforme más, `uSwap` (fuera de casa el bloque local naranja anima al rival). Más `uClap` (vec2) +
  `uClapK` (pulso común) para las palmas y `uHush`. **Ritmo de los cánticos** compartido arena/audio (`AMB_RHYTHM` / `AMB_CHANT`):
  palmas 2,1 s [0 0,3 0,6 1,2 1,5]; vamos / defensa / oe / nombre ciclo 2,4 s. **Añadidos**: `VB.Arena.ambState()`,
  `VB.Audio.ambPrep()` / `AMB_SOUNDS` / `ambState()`. El `ohh` de la tarjeta reutiliza `ooh` (no hay sonido propio).
- (integración, 18-nov) **Tras las críticas de juego y técnica** (detalle en §9):
  `VB.Arbitro`: «tocado» solo con `point.lastKind === 'block'`; `D.calledIn` (lo pitado en un bote); la elección se ofrece como mucho
  1 vez por partido (`RATES.offerMax 1`, `offerKinds {line, touch}`, `offerP 0,7`); otra protesta del mismo equipo en el mismo punto es
  mala conducta más severa (`RATES.again 1,6`), ya NO retraso (este árbitro no pita `delayY/delayR`); `RATES.autoTouch` 0,35;
  recalibrado (`autoK 1,25`, `withVerbal [0,35, 0,12, 0,53]`, `human 7`, `humanV 1,4`).
  `VB.Ambiente`: frases de protesta desde el que sufre la decisión (`protestIn` / `protestOut` / `protestTouch` / `protestNet` /
  `protestAnt`; `protest` desaparece), `refCard` → `refYellow` + `refRed`, `welcomeDu` / `preDu` (duelo de playa, LED «¡DUELO!»),
  `preRev`, `backUp`; ya no hay bocadillo `'sub/<kind>/<n>'` del compañero al abrir las fichas; en playa las frases del banquillo
  las dice tu pareja; `amb:card.name` = solo nombre propio o '' (la UI pone dorsal y club); `crowdOf(g)` = null con «Apagado» (también a
  mitad de partido); `st.cards[i].id` = id del `amb:card`; el castigo que no llega a darse quita `penalty` de su tarjeta (`penLost`).
  Grada: silencio tenso exclusivo en punto de set / partido; pitada al saque ≤ 0,12 por saque y ≤ 2 por set.
  `VB.AmbienteUI`: el subtítulo se aparta del balón y se acorta a 0,9 s con `serveReady`; sin bocadillos sobre el saque; leía mal
  `ambChoiceRect` / `cardRect` (`width`/`height`, no `w`/`h`): ahora sí los esquiva.
  ui.js: el punto de castigo va en la pestaña de jugada (no la cinta grande); las fichas se ocultan en la pausa y vuelven al reanudar.
  main.js: `cs.amb` y `cs.atHome` solo con el ajuste encendido; `?debug=intro&kind=long&career=1&derby=1|revancha=1|cumbre=1`.
  career-life `rivWeek` y career-world `rivAfter`: nada con «Apagado». sim.js `penalty`: respeta lo que quede de una pausa más larga
  (cambio de campo). badges.js: ignora el punto de castigo.
- (verificación, 18-nov) main.js `ambFrame`: con «Apagado» a mitad de partido el director pasa UN frame «saltando» (`st.offDone`):
  cierra unas fichas abiertas (antes se quedaban abiertas para siempre: su reloj solo corre en `frame()`, y CAMBIAR protestaba a
  ciegas), da por perdido un castigo pendiente y vacía la cola; solo sale el `amb:choiceEnd` para que ui.js quite las fichas.
  ui.js: la tarjeta de la hoja final / «Sanciones» dice «punto de castigo» solo cuando llega de verdad el `point.penalty`
  (`ambPenOk`); antes lo copiaba del `amb:card` y un castigo perdido después de salir la tarjeta seguía saliendo en la hoja.

## Rencor y cariño del club rival (21-nov-2026, rama unico-b)

`amb.bond` (−2..2, career.js ambCtx desde career-life `bondOf`; notes/carrera.md «Rencor y cariño de los clubes»). Con bond 0 no cambia
nada (misma secuencia de eventos con la misma semilla, ambientetest). Disparadores nuevos (prioridad 2): `welcomeGrudge` y `welcomeFond`
(megafonía, en lugar de `welcome`; la final, el derbi y el duelo se quedan con la suya) y `preGrudge` / `preFond` (previa, antes de
la revancha; rival 60 % o tu pareja/equipo, con la misma tirada 0x9D). Al empezar: rencor en su casa → `amb:boo` {by 1, target 'me',
k 0,5 + 0,2·|bond|, 3 s}; rencor en tu casa → pitada suave de su afición visitante (k 0,35); cariño en su casa → `amb:roar` {team 1}.
El calor ya sube en ambCtx (+0,1·|t| con rencor en su casa), así que la pitada al saque rival llega sola.

## Árbitros con nombre y carácter (21-nov-2026, rama unico-b)

**Colegio por liga** (career-world.js, bloque «árbitros»): playa `'B' + nivel`, pista el id de la liga (`'ES1'`); copas y KO usan el de
tu liga. `arbPanel(c, key)` da siempre 9 `{id: key + '-' + i, name, short (1r apellido), first, trait}`, puro y determinista
(`rngOf(c.seed, 'arb-pan', key)`). **Nombres inventados del todo**: nombre de pila (lista mixta propia) y DOS apellidos hechos con
piezas (`ARB_R` raíz + `ARB_S` final, sin repetir raíz ni final en la misma persona; `ARB_NO` quita los que existen); nunca de la
lista `ARBITROS` de acta.js ni de FIRST/LAST de career.js (lo mira worldtest §7). Ningún nombre ni apellido se repite dentro de un
colegio. Carácter: se baraja `['estricto' ×2, 'deja' ×2, 'lince' ×2, 'nervioso', 'manual' ×2]`.

**Designación**: `arbDesigna(c, n)` → `{ref, r2, sc}` (1r, 2º y anotador) con el hash de (temporada, fase, jornada/ronda, etiqueta,
rival); nunca el 1r de tu último partido (`c.world.arb.last`). Gancho `'setup'` (`onSetup`): pone `out.career.arb = {id, name, short,
trait, mem, derby, line, rec, r2, sc}` sin escribir en c. Nada con «Apagado», en el partidillo de prueba ni en partidos de extensión.
Con el **ojo de lince**, `out.ref.p1-p3 × 0,6` (falla menos las líneas); con el **nervioso en un derbi** (tags `derbi`, `clasico`
o `final` de ambCtx), × 1,3. Solo en ese partido de Carrera: el Partido rápido, el online y la huella 2v2 no llevan `cs.arb`.

**Carácter en VB.Arbitro** (`TRAITS`): estricto sev ×1,3 y provocación ×1,6; deja jugar sev ×0,7 y provocación ×0,5; lince umbral de
bote discutible ×0,6 (menos disputas de línea; las mal pitadas se discuten igual); nervioso sev ×1,35 solo con `derby`; manual ×1.
`create(o)` acepta `trait`, `derby` y `mem` (−0,15..+0,2, solo pesa en las protestas de tu equipo). **Sin `trait`, todo vale 1 y no
hay ficha «Frenar»**: las decisiones son idénticas a las de antes (arbitrotest 1b). career.js `ambNew` pasa `ref: cs.arb` a
`VB.Ambiente.create`, que lo guarda en `st.ref` y se lo da al árbitro en `arbOf`. Los bocadillos del 1r dicen «1r Apellido»
(`spRef`; sin `st.ref`, «1r árbitro»).

**Ficha «Frenar a … / Dejarle»** (`amb:choice {kind:'brake', opts:[{k:'protest', label:'Frenar a Iker'}, {k:'drop', label:'Dejarle'}],
def:'drop', sub:'Iker va a por el 1r'}`): `D.brake` lo marca VB.Arbitro cuando un compañero de la IA de tu equipo va a protestar y tú
eres capitán (pista: el brazalete del acta; playa: siempre, con tu pareja), en «Completo», con tu jugador en pista. Comparte tope y
separación con «Protestar» (`offerMax 1`, `offerGap 8`) y su tirada es `hash01(seed, n, 0xA16) < RATES.brakeP (0,6)` sin `st.k++`.
`'protest'` = frenarle (sin protesta ni riesgo de tarjeta; tu frase `brakeMate`; `st.brakes++`); `'drop'` o tiempo = su protesta,
como la automática. ui.js: botón 1 verde (`d`), botón 2 naranja (`p`); lector «Frenar a Iker o dejarle.». main.js no cambia.
`sum()` añade `ref` (id), `brk`, `brkName` y `myProt` (veces que elegiste «Protestar»).

**Libreta oculta** `c.world.arb = {last, p: {id: {m, y, r, pr, br, cl, cs, ev: {s, wk ('J4' | 'final' | 'semifinal' | 'cuartos' |
'octavos' | 'copa'), k ('red' > 'yellow' > 'brake' > 'protest' > 'clean'), n}}}}` (≤ 60, se quitan los de menos partidos):
`refAfter` tras `rivAfter` (lee `sum.amb`; nada sin `sum.amb.ref` o con «Apagado»); `refSeason` × 0,6 al empezar temporada.
`mem = clamp(0,10·y + 0,20·r + 0,05·pr − 0,05·br − 0,02·cl, −0,15, +0,2)`; no se enseña nunca.

**Previa** (recap.js `history`): duelo o cara a cara > 1r con recuerdo > Reto > 1r sin recuerdo (2 líneas). `arbLine`: «1r: Nombre
Apellido Apellido, …» ≤ 44 letras y sin «·» (si no cabe, «Nombre Apellido» y luego solo el apellido; con la frase corta si hace
falta): «te sacó amarilla en la J4», «te sacó roja en la semifinal», «te vio frenar a Iker (J3)», «le protestaste en la J2», «3 partidos
sin tarjetas», «… la temporada pasada»; sin recuerdo, la fama: «fama de mano dura», «deja jugar», «ojo de lince», «los derbis le pesan»
(el nervioso, solo en derbi; si no, «de manual»), «de manual».

**Mensajes y prensa** (career-story-msgs.js, informativos): `refCard` (tarjeta tuya), `refBrake` (frenaste), `refNext` (el 1r del
próximo te sacó tarjeta o le protestaste; en pista mira la designación sobre una copia, porque `next6` rehace la convocatoria);
pregunta 17 de prensa «¿Qué te ha parecido el arbitraje de {ref}?», al final de `PRESS` (los `pressQ` guardados siguen valiendo),
solo con 1r designado y tarjeta o protesta en el partido. **Acta** (oculta): ui.js `actaMeta.refs` = [1r, 2º, anotador] de `cs.arb`;
acta.js los usa si vienen los tres.

Escenas: `?debug=amb&k=brake` (la 1ª disputa en contra abre «Frenar a … / Dejarle», 1r «Quirada»; `&format=6v6` en pista; `&arb=1`
da el 1r con nombre en las demás) y `?debug=intro&kind=long&career=1&arb=1` (designación con recuerdo; `&arb=2` sin él).
