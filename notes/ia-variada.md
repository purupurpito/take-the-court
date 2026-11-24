# IA variada (1.22.0, imprescindible 4.8)

Informe: `estudios/revision-juegos-voley-2026-11-21.md` §4.8 «IA que no repite el mismo ataque». Antes, `openSpot` (js/ai.js) solo
añadía ruido según la dificultad y no recordaba nada: en Experto (ruido 0,4 m) remataba casi siempre a la misma zona libre (en la playa,
contra el bot medio, el 75 % de los remates por el mismo carril tres veces seguidas) y sacaba siempre al mismo receptor (≈ 65 % de tres
seguidos). `chooseSet` (js/ai6.js) repartía al azar sin mirar a quién había colocado.

## Qué hace

Memoria corta por equipo en `g.aiMem` (sim.js `createGame`, en el literal; `newGame` la vacía). Datos planos (números), así que
`copyGame` la copia como el resto de la partida.

| Clave | Qué guarda | Lo usa |
|---|---|---|
| `atk[t]` | casilla de los 3 últimos remates de la IA del equipo t (rejilla de openSpot, 4 × 5, relativa al lado; −1 = nada) | `openSpot(…, 'atk')` |
| `lane[t]` | carril de los 2 últimos remates (1 diagonal, 2 línea, 0 centro; `VB.Sim.laneOf`) | `openSpot(…, 'atk')` |
| `srv[t]` | casilla de los 3 últimos saques | `openSpot(…, 'srv')` (saque a la zona libre) |
| `rcv[t]` | receptor (id del rival más cercano al destino) de los 2 últimos saques | `serveTarget`, `openSpot(…, 'srv')` |
| `set[t]` | atacante (id) de las 2 últimas colocaciones 6v6 | `VB.AI6.chooseSet` / `previewSet` (buildCand) |

- **Remate y saque a la zona libre** (`openSpot` con `mem`): cada casilla lleva una penalización aparte (`MEM.rep` = 1,2 por cada vez que
  sale en la memoria; `MEM.lane` = 0,8 si los 2 últimos remates fueron por ese carril; `MEM.rcv` = 0,8 si su receptor más cercano recibió los
  2 últimos saques). Se elige **entre las casillas que puntúan como mucho `MEM.tol` = 0,6 por debajo de la mejor** la de menos repetición.
  Es decir: varía solo cuando hay otra casi igual de buena. Así Experto, que lee muy bien el hueco, no regala puntos por variar.
- **Saque a por un receptor** (la rama `srvNoise`): si los 2 últimos saques fueron al mismo receptor y el azar vuelve a elegirlo, va al
  siguiente de la lista (sin tirar otra vez).
- **Colocación 6v6**: el atacante de la IA que recibió las 2 últimas colocaciones va con peso × `MEM.set` = 0,6. El humano nunca
  (si pide el balón, se respeta).
- La dejada (`tip`) y el balón libre del 3r toque no cuentan ni se miran.
- Se apunta en `VB.AI.remember(g, p, 'atk'|'srv', x, y)` (en `update` justo antes de `_hit` y al final de `serveTarget`) y en `chooseSet`.

## Azar y online

- **Nunca gasta `g.rng`**: las mismas llamadas, en el mismo orden, en cada decisión. Lo que cambia es el destino elegido, y por eso cambian
  las huellas (a propósito): `tools/fp-2v2.json`, `tools/fp-mastery.json` y `tools/fp-salto.json` regeneradas el 22-nov-2026 (simtest exige
  la 2v2). `fluidsimtest` SIM_BASE = `74daeb88`.
- Sin `g.aiMem` todo es exactamente lo de antes (todas las ramas miran si existe): `tools/variedadtest.js` lo usa como «antes» y da los mismos
  números que el código de main.
- **Online Precisa** (net.js, rollback): los dos lados simulan todo; la memoria es parte de la partida y `copyGame` la copia (variedadtest
  comprueba que copiar a mitad de partido y seguir da el mismo `stateHash`).
- **Online Fluida** (netfluid.js): cada máquina decide solo los toques de su equipo, y solo lee la memoria de su equipo. La del otro equipo
  no se usa en esa máquina. No hace falta mandarla.
- netview la clasifica `'as'` (la vista no la lee).

## Medidas (`node tools/variedadtest.js`, 4000 s por casilla y el triple en las de Experto con bot; tools/out/variedad.json)

«3seg» = % de remates de la CPU a la misma casilla que los dos anteriores; «carril3» = lo mismo por carril; «rec3» = saques al mismo
receptor tres veces seguidas; «CPU %» = puntos que gana la CPU contra el bot de simtest.

| Casilla | 3seg antes → ahora | carril3 | rec3 | entropía remate (bits) | CPU % antes → ahora |
|---|---|---|---|---|---|
| 2v2 medio Experto | 6,5 → 0,2 | 27 → 13 | 64 → 18 | 2,43 → 3,05 | 72,5 → 75,5 |
| 2v2 bueno Experto | 7,5 → 0 | 36 → 17 | 70 → 17 | 2,28 → 3,02 | 62,3 → 63,0 |
| 6v6 medio Experto | 2,6 → 0,5 | 15 → 8 | 17 → 2 | 3,05 → 3,20 | 66,8 → 67,5 |
| 6v6 bueno Experto | 3,4 → 0,5 | 16 → 7 | 18 → 2 | 2,93 → 3,22 | 62,0 → 61,8 |
| playa medio Experto | 15 → 1,1 | 76 → 28 | 70 → 19 | 1,83 → 2,79 | 75,7 → 77,1 |
| playa bueno Experto | 14 → 0,8 | 81 → 31 | 67 → 18 | 1,73 → 2,78 | 63,7 → 62,3 |

(22-nov-2026, 764 s; «antes» = el mismo código sin `g.aiMem`, que da exactamente los números de main: comprobado con `--base HEAD`.)
En 6v6, colocaciones de la IA al mismo atacante tres veces seguidas: 13-17 % → 9-15 % (con 2-3 atacantes posibles, más no tiene sentido).

Experto sigue igual de duro: las diferencias de puntos están dentro del ruido de la muestra (≈ 2-3 puntos). Con la primera versión, sin
`MEM.tol` (penalización directa), bajaba de 88,9 % a 77,3 % contra el bot medio (muestra corta) y se descartó.

## Pruebas que se movieron con los destinos nuevos

- `tools/fluidtest.js`, escenario «corte de 15 s»: el partido (playa, a 11) se alarga en la ventaja hasta 19-21 (~990 s) y no acababa en
  los 900 s por defecto; los dos lados llevan el mismo marcador todo el rato. Se le dan 1800 s.
- `tools/fluidtest.js` [4 rtt 250 jit 20 pérdida 2 playa s1]: 2 recuperaciones > 300 ms en un lado (máx. 316 ms) con tope 1; en main ya
  estaba en el borde (1, de 300 ms). No se ha tocado el tope: es de la red, no de la IA.
- `tools/simtest.js`: con una sola semilla, la demo de 20 min cierra 1 set (en main 2) y el % de remates que son punto sale 36 % (banda
  38-65 %), y la calibración del highlight da 25,2 % (tope 25 %) y 5,1 % (tope 5 %). Medido con 30 semillas de demo (10 min): remates que
  son punto 37,4 % sin memoria y 36,8 % con ella (por semilla, 26-47 %); puntos grandes 21,7 % y 20,2 %. La memoria no los mueve: la banda
  del 38-65 % (medida antes del modelo de esfuerzo del 18-nov) ya queda por encima de lo que da el código de main con la mayoría de semillas.
  **22-nov (revisión de la rama; confirmado el mismo día con 100 partidos de demo en la rama y en main, notes/pendientes-ferran.md 4.8.5):** bandas recalibradas en tools/simtest.js: remates que son punto centrados en
  0,37 (mismo ancho), la demo pide un set cerrado (no dos) y los topes del highlight 28 % / 6 %. simtest vuelve a TODO OK
  (notes/pendientes-ferran.md, «Imprescindibles 1.22.0», 4.8.5).

## Lo que no se hizo

- La «versión ligera del bloqueo que se corre tras 4 remates seguidos al mismo carril» (fuera de la Carrera) del plan del informe: la
  reacción a lo que repite el jugador sigue siendo solo «Te tienen estudiado» (Carrera). Queda para otro sprint (cambiaría el bloqueo de la
  IA contra el humano y movería otra vez las huellas).

Cambiar la fuerza: `MEM` en js/ai.js (`VAR_MEM='{"tol":0.4}' node tools/variedadtest.js` prueba otros valores sin tocar el código).
