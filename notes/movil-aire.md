# notes/movil-aire.md — Rediseño móvil «con aire» (rama movil-aire)

Especificación de la dirección de diseño, 23-nov-2026. Base: pasada «antes» de `tools/mobaudit.js` (241 pantallas × 568x320 / 844x390 /
915x412, DPR 2; PC 1280x720 aparte), 7 revisiones UX por zona y 3 revisiones de marketing (director, jugador nuevo y jugador de club).
Capturas «antes»: `C:/Users/Puru/AppData/Local/Temp/claude/256b3765683db9c6/7d7e82ec-6440-4b76-aa17-571f5ef4d6f9/scratchpad/movil/antes/`.

Lo que pidió Ferran: «El menú está muy bien para PC. Para móvil está muy cramped todo». **REGLA DE ORO: en PC (sin `html.ph`,
de 1024x768 en adelante) no cambia nada visible.** Todo selector nuevo empieza por `html.ph` (`:root.ph`, `.ph-s` = alto ≤ 345,
`.ph-w` = ancho ≥ 800; ver `js/splat.js:205`), salvo los arreglos de vertical, que van con la clase nueva `html.pv` (ver §3.12).

---------------------------------------------------------------------------------------------------------------------------------

## 1. Diagnóstico: por qué está apretado (10 líneas)

1. Se trajo la composición de PC a móvil encogida: los mismos bloques (cabecera héroe, pestañas, sello, tarjeta, pie) a 320-412 px de alto.
2. Cabecera «‹ Volver» en bocadillo + título héroe + fila de pestañas + sello que repite la pestaña: entre 100 y 190 px antes del primer dato.
3. En la Carrera hay 3 o 4 niveles de navegación a la vez (raíl de ~100-130 px, tira de subpestañas, segmentado, sello), un 20-35 % del ancho.
4. Filas y tarjetas de 2-5 líneas (descripción, «|», chips, cita) donde basta una: 60-120 px por fila, y a 568 se ven 1-3 elementos.
5. Párrafos de reglas escritos en pantalla (400-650 caracteres en Contrato, Insignias, Cómo se juega…) en vez de detrás de un ⓘ.
6. Botones secundarios con el tamaño del principal (bocadillos de 300-770 px para «Ver los 6», «Ir cedido», «Menú», «Cerrar»).
7. Lo fijo tapa lo que se desplaza: el dock, los toasts, el chevron `sp-more` y el degradado cortan la última fila a media línea.
8. Pegatinas, kickers y rótulos colocados cada uno por su cuenta: se montan sobre títulos (Reto del día, Situación de la semana, seña del HUD).
9. Muchos huecos de 3-8 px entre objetivos (los goterones SPLAT se tocan) y mucho texto de 12-13,9 px para que «quepa».
10. A 844-915 el contenido usa el 40-60 % izquierdo y deja vacío el resto mientras parte líneas: falta de ancho aparente, no real.

## 2. Principios (8)

1. **Contenido antes que navegación.** Una sola franja de navegación por pantalla (cabecera compacta de 44-48 px); en la Carrera, raíl fino de iconos.
2. **Una acción principal por pantalla, abajo a la derecha** (el parche crema con ▶, que es la firma del juego). Como mucho un secundario de 44 px a su izquierda; lo destructivo, lejos del pulgar derecho.
3. **Resumen a la vista y detalle a un toque.** Título + 1 dato clave; lo demás en ⓘ, en una hoja inferior (`SP.sheet`) o al tocar la fila. No se borra nada de PC: se pospone.
4. **Filas de una línea.** Lista tocable = 44-52 px; tabla de consulta = 36 px; fila de dos líneas = 64 px como máximo. Rejilla de 2 columnas en horizontal cuando la fila es corta.
5. **Nada flotante encima de lo que se desplaza.** Padding inferior = dock + 12 px; degradado ≤ 24 px; toasts fuera de las listas; cortar entre tarjetas, nunca a media línea.
6. **Dos tamaños de cuerpo, no seis.** Cuerpo 15 px, secundario 13 px, micro 12 px solo para marcas (T1 J4, chips decorativos). Lo que no cabe a 13 se acorta o se quita, no se encoge.
7. **No repetir.** Fuera el sello que repite la pestaña, la segunda salida (Cancelar/Entendido/Cerrar), el título que repite la tarjeta, el aviso que sale tres veces.
8. **SPLAT con jerarquía.** Se mantienen bocadillos, manchas, sellos y colores; la mancha grande se reserva al CTA principal y los sellos van en las esquinas, nunca sobre texto. PC intacto.

## 3. Cambios de sistema (paquete `sistema`)

Todo bajo `html.ph` en el bloque de tokens `--ph-*` de `index.html` (donde ya están `--ph-body`, `--ph-cap`, `--ph-hh`…) y en `js/splat.js`.
Los tokens existentes **no se borran ni se renombran**; se ajustan dos valores y se añaden los nuevos.

### 3.1 Escala de letra

| Token | Antes | Después | Uso |
|---|---|---|---|
| `--ph-body` | clamp(14, …, 16) | igual | cuerpo de texto, descripciones de una línea |
| `--ph-row` | clamp(15, …, 17) | igual | título de fila / nombre |
| `--ph-label` | clamp(13, …, 14,5) | igual | rótulos funcionales, etiquetas de selector, kickers que hay que leer |
| `--ph-cap` | clamp(12, …, 13) | **clamp(13px, 11.4px + .29vw, 14px)** | secundario (sube el suelo a 13) |
| `--ph-micro` (nuevo) | — | **12px** | solo marcas: «T1 J4», chips decorativos, `.st-cal-tag`, contadores; nunca frases |
| `--ph-head` | clamp(18, …, 22) | igual | título de la cabecera compacta |
| `--ph-num` | clamp(17, …, 22) | igual | cifras de dato |
| `--ph-title` / `--ph-hero` | — | igual, pero **no se usan en cabeceras de panel** en .ph | solo portada, final, previa |

Regla: ningún texto visible < 12 px (cierra `.vt-tip`, `.vt-set span`, `.vt-zoom b` a 11 y `.st-cal-tag` a 10,5). Al subir `--ph-cap` a 13,
cada paquete revisa que no aparezcan elipsis nuevas; si aparecen, se acorta el texto (§3.9), no se baja la letra.

### 3.2 Espaciado

Se mantienen `--ph-s1..s5` (4/8/12/16/24) y `--ph-hit-gap` (10). Nuevos:

- `--ph-gap-min: 8px` — separación mínima entre dos objetivos **contando el adorno** (cola de bocadillo, goterón, sombra). Si un adorno invade, se recorta con `clip-path`/`overflow` o se suma margen.
- `--ph-btn-gap: 12px` — hueco en filas y rejillas de botones (pausa, hojas finales, Pausa↔Zoom del HUD, segmentados `.seg`).
- `--ph-card-gap: 10px` — entre tarjetas de una lista.
- `--ph-pad: 12px` (10px en .ph-s) — relleno interior de tarjeta/panel en móvil. **Un solo nivel de marco**: en .ph, si hay tarjeta crema dentro de panel oscuro, el panel pierde borde y padding (doble marco fuera).

### 3.3 Alturas de fila y de botón

| Token nuevo | Valor | Uso |
|---|---|---|
| `--ph-bar` | 44px (.ph-s) / 48px (resto) | cabecera compacta de panel (§3.5) |
| `--ph-tap` | 44px | objetivo mínimo: icono-botón, flecha, interruptor (área), pestaña |
| `--ph-row-1` | 44px | fila tocable de una línea (lista de clubes, calendario si abre) |
| `--ph-row-h` | 52px | fila estándar con acción (Ajustes, Vestuario, atributos, tienda) |
| `--ph-row-2` | 64px | fila de dos líneas, máximo (mensajes, logros, oferta compacta) |
| `--ph-row-t` | 36px | fila de tabla de consulta no tocable (liga, ranking) |
| `--ph-cta-h` | 48px (.ph-s) / 52px (resto) | CTA principal (parche crema) — sustituye en .ph los 56-72 px actuales vía `--sp-ph` |
| `--ph-btn-h` | 44px | secundario `sp-btn sp-md`/`sp-sm` sin cola |
| `--ph-dock-h` | calc(var(--ph-cta-h) + var(--ph-gb) + 8px) | alto reservado por el dock |
| `--ph-fade` | 24px | alto máximo del degradado de fin de scroll (`.sp-more`) |

Interruptor `.sp-toggle` en .ph: dibujo 52x30, la **fila entera** es el objetivo (ya es `ph-proxy`) con estado `:active` de fila visible; mobaudit
deja de contarlo como t<44 cuando el proxy mide ≥ 44 de alto (ajustar `mobaudit-page.js` para medir el proxy, no el dibujo).

### 3.4 Márgenes seguros / notch

Se mantienen `--ph-g = max(16px, var(--sl), var(--sr))`, `--ph-gt`, `--ph-gb`. Reglas nuevas:
- Todo lo fijo (cabecera, dock, raíl, toasts, Pausa/Zoom) se coloca con estos tokens, nunca con px sueltos.
- Dock: `bottom: var(--ph-gb)`; `right: var(--ph-g)`. Raíl de Carrera: `left: var(--ph-g)` (con notch a la izquierda, el raíl no se mete debajo).
- Contenido con scroll: `padding-bottom: calc(var(--ph-dock-h) + 12px)` cuando hay dock; `scroll-padding-top` = alto de la cabecera fija/thead sticky.

### 3.5 Cabecera compacta (componente `.ph-bar`)

Una sola franja de `--ph-bar` de alto en `top: var(--ph-gt)`:
`[‹ 44x44, solo icono, sin bocadillo] [título a --ph-head, 1 línea con elipsis  —ó—  pestañas] [acciones 44x44 a la derecha]`.
- Si el panel tiene pestañas (Ajustes, Controles, Retos, Acerca de, Opiniones, Novedades/Créditos, Sugerencia/Bug), **las pestañas van en esta
  franja y el título desaparece** (lo dice la pestaña activa). Si no, título corto.
- El título héroe (`AJUSTES`, `CONTROLES`, `RETOS`, `JUGADORES`, `VESTUARIO`, `CÓMO SE JUEGA`, `ESTADÍSTICA DEL PARTIDO`, «‹ JUGAR») no se pinta en .ph.
- El panel empieza en `top: calc(var(--ph-gt) + var(--ph-bar) + 4px)`. Ganancia esperada: 30-70 px por pantalla.
- El botón «‹» conserva `aria-label` con el texto de antes («Volver», «Menú»). En la Carrera, «‹ Menú» pasa a pin de 44 px (§3.6).

### 3.6 Navegación de la Carrera: raíl fino + tira desplazable

- **Raíl** (`#crTabs.sp-vtabs` en .ph): 64 px de ancho a todos los tamaños de móvil; ítems de 44 px de alto (icono 22 px + rótulo de 12 px en una
  línea, rótulos cortos ≤ 7 letras), gap 6 px. **Mensajes sale del raíl** y pasa a la cabecera como sobre de 44x44 con insignia, junto al sello de
  la media. Quedan 5 apartados: 5×44 + 4×6 = 244 px, caben en 320 − cabecera − márgenes **sin desplazar**; «Partido» siempre arriba.
  Si en algún caso hay scroll, sombra/flecha visible arriba y abajo (no basta `.sp-less`).
- **«‹ Menú»**: pin de 44x44 con flecha (texto «Menú» en `aria-label`; opcional a `--ph-micro` debajo si cabe).
- **Tira de subpestañas** (`#crSub`): 40 px de alto, `padding: 0 10px`, rótulo a `--ph-label`; desvanecido de 16 px en el borde con más contenido y
  chevron fijo de 28 px (‹/›) cuando hay pestañas ocultas; `scrollIntoView({inline:'center'})` de la activa al entrar. Rótulos cortos en .ph:
  Insignias→«Firma», Vestuario→«Ropa», Calendario→«Jornadas», Opciones→«Ajustes».
- **Un punto rojo por nivel**: en el raíl solo el apartado con algo nuevo de verdad; en la tira, solo la subpestaña concreta; como mucho 2 visibles.
- **Sello repetido fuera**: helper `SP.phDedupe(container, label)` en splat.js — en .ph oculta el primer `.card>h3.sp-stamp`/`.cr-ovr` cuyo texto
  coincide con la subpestaña activa; si el sello lleva dato («2 de 31», «1.900 €», «Sin plan»), el dato pasa a insignia de la pestaña o a una línea
  fina dentro de la tarjeta.
- **«?» de ayuda** (`.sp-q.cr-q`): 44 px, **dentro** de la línea del sello o de la cabecera de tarjeta, a la derecha; nunca flotando a −26 px sobre
  el borde (hoy 56-96 px).
- En PC no cambia nada: raíl ancho, pestañas arriba, Q/E.

### 3.7 Dock y acción principal (zona del pulgar)

- `#crDock` y los docks equivalentes (Partido rápido, Entreno, Cómo se juega, crear jugador): CTA principal de `--ph-cta-h`, **ancho automático
  (máx. 62vw)** y alineado a la derecha; texto en una línea (`white-space:nowrap`, `--sp-pt` reducida como ya hace `plan-go`, `line-height ≥ 1.1`
  para que no se corte la Ñ); el resto del texto como `small` debajo.
- Secundario: `sp-btn sp-md` de 44 px sin cola, a la izquierda del principal, con `--ph-btn-gap`. Terciarios: enlace/botón fantasma o a la cabecera.
- **Si el cuerpo tiene una decisión pendiente** (aceptar/rechazar puesto, jugar con la selección, fisio, renovar), el dock lleva esa decisión;
  si no, la tarjeta abre como hoja. Nunca un dock genérico («Ir al plan del entrenador») mientras se está en el plan.
- A 844+ (`.ph-w`), en pantallas de opciones (Partido rápido, Crear sala) la CTA puede ir a una columna derecha de 200-220 px a media altura.

### 3.8 Hojas inferiores y «Más detalle»

- Se usa `SP.sheet()` (ya existe). En .ph: hoja a `--ph-fw` centrada, fondo **opaco** (`var(--sp-ink)` sin alfa), capa detrás `rgba(10,6,24,.7)`,
  un solo cierre ✕ de 44 px arriba a la derecha (+ gesto atrás). Se quita el segundo cierre (CERRAR/ENTENDIDO) en .ph.
- Patrón «ⓘ / Más detalle»: lo que hoy es un párrafo de reglas pasa a la hoja; en pantalla queda una línea con el dato clave.
- Patrón «al tocar»: descripciones de atributos, bio de personas, cita de Gente, detalle del saque de firma → hoja o acordeón de la fila.
- Modales que hoy son translúcidos (informe del rival, Instalar a 844, reglas) siguen esta misma regla en .ph.

### 3.9 Cómo se esconde lo secundario

- Clases utilitarias (crear si no existen): `.ph-only` (display:none fuera de .ph) y `.ph-no` (display:none en .ph). Para textos cortos:
  `<span class="ph-no">Cámara en 6 contra 6</span><span class="ph-only">Cámara 6v6</span>`. Alternativa en JS: `data-ph-short` que `splat.js`
  aplica en el evento `vb:ph` (guardando el texto largo para volver). Nada de esto se ve en PC.
- Descripción de fila: 1 línea (`white-space:nowrap; text-overflow:ellipsis` o `line-clamp:1`) + ⓘ que abre el texto entero; el ⓘ sale en **toda**
  fila recortada.
- Separadores: en vez de «|» en texto corrido, `·` dentro de `.nw` por dato, o separador `::before` solo entre elementos de la misma línea;
  marcadores siempre en `.nw` («17-15»).
- Chips decorativos que no aportan (Nv1 en portada, «::32» en Vestuario, «Pendiente» en el calendario, «(a cada jugador)») → fuera en .ph.

### 3.10 Toasts, avisos y pegatinas

- `.sp-toast` en .ph: abajo en el centro, encima del dock (`bottom: calc(var(--ph-dock-h) + 8px)`), máx. 60vw, 1 línea, se va solo; **nunca** encima de
  `#optList`, rejillas o listas. Se limpia en cada `showPanel` / cambio de pantalla (hoy «Aro de caída…» se queda en Entrenamiento).
- Ayudas permanentes («Elige un hueco…») → texto vacío en la ficha de detalle, no toast fijo.
- **Pegatina de esquina** (`.ph-sticker`, para «La situación de la semana», «Reto del día», kickers «PRIMERA VEZ»/«PARTIDO A MEDIAS»): 60-72 px,
  `position:absolute; top:-14px; right:-10px; rotate(8deg)`, fondo propio, nunca sobre el título/subtítulo; el contenedor reserva `padding-right`
  si hace falta. Mismo componente en vertical (`html.pv`).

### 3.11 Componentes de lista compartidos (para los paquetes de zona)

- `.ph-kv`: lista clave:valor en 2 columnas (3 a `.ph-w`), filas de 40 px, etiqueta `--ph-micro` mayúsculas a la izquierda / valor `--ph-row`
  a la derecha, una sola caja con separadores (sustituye las fichas `.fact` de 60-100 px).
- `.ph-strip`: tira de cifras de una línea (reutilizar `.sp-heros.cr-oh` de Ofertas).
- `.ph-row`: fila de una línea `--ph-row-h`: [icono/escudo 28-36] [nombre --ph-row + secundario --ph-cap, elipsis] [cifra/acción 44 a la derecha].
- `.ph-grid2`: rejilla de 2 columnas a 568 (3 a `.ph-w`) con gap `--ph-card-gap`.

### 3.12 Vertical (decisión)

- **No se fuerza el giro en los menús** (portada y Jugar en vertical funcionan y retienen al que abre el enlace en vertical).
- Clase nueva `html.pv` (en splat.js, junto a `ph`): `pointer:coarse` y `innerWidth ≤ 500` y `innerHeight > innerWidth`. Nunca se activa en PC.
- Con `.pv`: los sellos de portada y Jugar usan `.ph-sticker` (fin de los dos solapes); «Volver» del menú Jugar baja a la zona del pulgar
  (abajo a la izquierda, 48 px).
- **Carrera en vertical**: se muestra el aviso `#rotate` (mismo texto) también con `state` de Carrera, sin parar nada (no hay simulación). Los
  paneles de Ajustes/Controles/Perfil en vertical quedan como están (sin probar a fondo; fuera de alcance salvo solapes evidentes).

### 3.13 Herramienta de auditoría (parte del paquete `sistema`)

- `tools/mobaudit.js`: reiniciar entre pantallas el ajuste de zurdos (hud-2v2-peloteo salía en espejo), la subpestaña de Bandeja (carrera-*-inbox
  a 844 salía en Redes) y la vista de lista de Clubes (league-clubs salía en ficha). Fijar el estado de cada id antes de capturar.
- `life-legacy` y `honors-seasons` capturan Fama y Vitrina porque en móvil se funden (`career-ui.js:1603-1627`): dejar la fusión, hacer que el id
  haga scroll al ancla (§ tabla) y anotarlo en la fila.
- `mobaudit-page.js`: medir `ph-proxy` en vez del dibujo del interruptor; excluir `span.arr` vacío de `#optDiff`; añadir métrica «rótulos solapados»
  para no tocables (`#pbug`, `.sp-sena`, `#prompt`, `#banner`, `#coach`, `#touchbar`) — esta última la usa el paquete `partido`.

### 3.14 Comprobación de la REGLA DE ORO (cada paquete)

1. `git diff` del paquete: todo selector CSS nuevo lleva `html.ph`/`:root.ph`/`.pv`; todo JS nuevo de layout va tras `SP.phone()` o `vb:ph`.
2. `DPR=2 node tools/mobaudit.js --desktop --sizes 1280x720 --only <ids del paquete> --out <scratch>/pc-despues` y comparar a ojo con
   `…/antes/pc/1280x720/<id>.png`; `node tools/mobcompare.js` de las métricas de PC: sin cambios.
3. Móvil: `DPR=2 node tools/mobaudit.js --sizes 568x320,844x390,915x412 --only <regex> --out <scratch>/despues --merge`, y
   `node tools/mobcompare.js <antes> <despues> <scratch>/cmp.html`. Objetivo por pantalla: 0 textos < 12, t<44 = 0 (salvo proxies), peg ≤ 2,
   sol = 0 en lo tocable, y **lo accionable a la vista sin desplazar a 568x320**.

---------------------------------------------------------------------------------------------------------------------------------

## 4. Lo que se MANTIENE (marketing)

- El sistema SPLAT entero (bocadillos cosidos, manchas, contornos, colores naranja/verde/turquesa/crema/lima). Se afina, no se quita.
- El CTA parche crema con ▶ abajo a la derecha (JUGAR, ¡A JUGAR!, REVANCHA, SEGUIR JUGANDO, VER LA JORNADA).
- Portada (jerarquía logo → JUGAR → Jugadores/Vestuario → 3 secundarios; a 568 los círculos con etiqueta) — solo sellos, kickers y huecos.
- Menú Jugar (Partido rápido destacado, Carrera en franja, 3 tarjetas). Partido rápido: rejilla 2x3 con flechas y CTA único.
- La tarjeta amarilla ¡Jugar ya! como lo primero en la primera sesión.
- HUD del partido: joystick y botones grandes, marcador arriba a la izquierda, Pausa arriba a la derecha, chuleta SACAR/SALTAR. **No se rediseña**:
  solo se arreglan choques de rótulos, se baja el aviso del saque a la franja de abajo en .ph-s y se separan Pausa/Zoom.
- Pausa, previa y hoja final (orden «Más difícil · Menú · Revancha»): candidatas a captura de tienda; cambios mínimos.
- Lista Online con tarjetas de color y CÓDIGO/CREAR SALA a la derecha. Bandeja de mensajes como lista (avatar, remitente, 1 línea, «!»).
- Atributos de Jugador en 2 columnas con +1 redondo; Contrato en tarjetas de dato legibles (se compactan, no se cambian de concepto).
- Vitrina con huecos por categoría (se densifica). Sello «Tu media» (se reduce). Puntos rojos y contadores (se racionan).
- Voz propia de los textos (juvenil, mensajes, chapas «TE TIENEN ESTUDIADO»): se mueve un toque más allá, no se recorta el tono.
- 3D del pabellón visible detrás (paneles sin fondo opaco salvo hojas/modales).
- En PC, absolutamente todo tal cual.

---------------------------------------------------------------------------------------------------------------------------------

## 5. Tabla por pantalla

Prioridad: A = alta, M = media, B = baja. «Sist.» = se arregla con §3 sin trabajo propio. Las filas agrupadas comparten componente.
Paquete entre corchetes.

### 5.1 Portada, Jugar, partido rápido, entreno, Cómo se juega, Jugadores, Acerca de, Opiniones, Instalar, Online [menus]

| id | nota | cambios | prio |
|---|---|---|---|
| home | 7 | Sello semanal → `.ph-sticker` en la esquina de JUGAR (vuelve el subtítulo); `.sp-t` de JUGAR con line-height 1.1 + padding-bottom 2px (recorte); secundarios con gap `--ph-hit-gap` a 844+; fuera pastillas Nv de Jugadores; a 568 etiquetas de círculo letter-spacing 0, max-width 30vw | M |
| home-jugarya, home-seguir | 6 | Kicker dentro de la tarjeta `.pl-cont` o como pastilla con fondo (top:-10px); tarjeta de continuar a 56 px; JUGAR baja a 52 px sin subtítulo cuando hay algo que continuar; margen superior `--ph-gt`+8 | M |
| home-seguir-carrera | 6 | Lo de home-seguir + álbum como icono circular 48 px con contador-insignia; versión a 12 px opacidad .6 u oculta en .ph | M |
| home-carrera | 5 | Título de la tarjeta en 1 línea con elipsis a `--ph-row`; un escudo de 40 px (fuera «EN» y sede); subtítulo «T1 J5 · Continuar» a `--ph-cap`; 12 px entre tarjetas; tarjeta ≤ 60 px a 568 | A |
| jugar | 6 | Sello Retos → `.ph-sticker` fuera de «PARTIDO RÁPIDO»; cabecera sin la palabra JUGAR (‹ 44 + miga); subtítulo Carrera corto en 1 línea («Playa o pista: crea tu jugador»); 12 px entre Carrera y las 3 tarjetas; tarjetas de 88 px con icono 40 | A |
| quick-2v2, quick-6v6 | 7 | Columna «?» de 44 px reservada (visibility:hidden) para alinear pastillas; 12 px bajo ‹; flechas desactivadas opacity .35 sin borde; `span.arr` vacío pointer-events:none; a `.ph-w` ¡A JUGAR! en columna derecha 200 px; etiquetas a `--ph-label` | B |
| quick-corto | 5 | Ayuda de «?» como línea fija bajo la rejilla (1 línea, 32 px) o bocadillo debajo de la fila, nunca encima; se limpia al cambiar de panel (§3.10) | M |
| entreno | 4 | Rejilla de 2 columnas de tarjetas de 52 px (icono 32, título `--ph-row`, subtítulo 1 línea); un solo estado por tarjeta (NUEVO **o** estrellas/nota); PELOTEO LIBRE como botón de 44-48 px en la cabecera (junto a «0 de 15") o primera tarjeta crema; si queda abajo, padding-bottom = dock+12; cabecera `.ph-bar` | A |
| comojuega-1, -2, -5 | 5 | Cabecera `.ph-bar` «‹ Paso 1/6» sin título héroe; texto en 2-3 viñetas ≤ 90 car. con teclas en chip; detalle tras «Más detalle ⓘ» (hoja); ilustración 28 % (máx. 150 px); pie: puntos de progreso + ‹ 48x48 a la izquierda, SIGUIENTE 48-52 px a la derecha; «Ace» como chip de glosario | A (5: M) |
| comojuega-3, -4 | 4 | Lo mismo + «Lo básico» (2 viñetas) y «Avanzado» en la hoja; chips «Paso 3/6 · 2º toque» en una línea | A |
| comojuega-6 | 4 | Reglas en `.ph-grid2` (3 a `.ph-w`), tarjetas de ~80 px; panel opaco al 96 %; CTA 52 px | A |
| jugadores-g0, -g1, -g2 | 4 | Fila de atributo de 48 px en una línea (nombre · barra · número · +1 de 44); descripción al tocar el nombre; N.º1/N.º2 como conmutador de 2 chips de 48 px sobre las pestañas; ASPECTO como botón 44 en la cabecera; arreglar el círculo «1» suelto sobre Salto; contador de Insignias como insignia de pestaña; cabecera `.ph-bar` | A |
| acerca-novedades | 4 | Pestañas en la `.ph-bar` (sin «ACERCA DE»); fuera ENTENDIDO en .ph; un solo marco (tarjeta crema a `--ph-fw`, padding 16); viñetas `--ph-body`, lh 1.35, 8 px entre ellas | M |
| acerca-creditos | 5 | Lo de novedades + créditos como `.ph-kv` (filas 36-40 px, sin tarjeta por fila) | B |
| opiniones-sug, opiniones-bug | 4 | `.ph-bar` con ‹ + pestañas Sugerencia/Bug; textarea flex:1 (mín. 96 px) sin scroll de panel; ENVIAR en columna derecha de 140 px; fuera CANCELAR; «Se adjunta…» tras ⓘ; contador desde 1800; con teclado (visualViewport < 220) se esconden cabecera y pestañas; bug: contacto plegado «+ Añadir cómo contactarte», placeholder corto | A |
| aviso-colocador, carrera-pista-aviso-colocador | 7 | Texto en 2 frases (~140 car.) y resto tras «Más»; ACTIVAR abajo a la derecha (52 px), AHORA NO 44 px encima, NO MOSTRAR MÁS como enlace/casilla; 12 px entre botones | B |
| primer-partido | 8 | Fuera el chip «6 pasos, 1 minuto» en .ph; JUGAR YA a la izquierda de VER CÓMO SE JUEGA en la misma fila de abajo | B |
| instalar-ios, -android, -app | 7 | Hoja centrada y opaca (§3.8); número de paso en línea (círculo 32 px); dibujo 64-80 px; SIGUIENTE dentro de la hoja (margin-bottom 12); tarjeta sin min-height | B |
| online-list | 5 | Tarjeta de sala de 56 px en una fila (escudo 36 · nombre · «Platja Llarga · 1 set a 21» a `--ph-label` · ENTRAR 44); a 568 CÓDIGO/CREAR SALA en columna derecha de 150 px; no disponibles con fondo oscuro opacity .55; «Juegas como» → chip de 44 px con lápiz | A |
| online-aviso | 6 | Lo de online-list + aviso como cinta de 1 línea (40 px) bajo la cabecera o en la tarjeta que falló | M |
| online-create | 4 | `.ph-grid2` de selectores (rótulo encima `--ph-label`, ‹ valor › debajo; 72 px por celda) → 5 opciones a la vista; vista previa fuera a 568 y a 260 px a `.ph-w`; valor nowrap+elipsis; gap 12 | A |
| online-help | 7 | A `.ph-w` 2 columnas de secciones (2 páginas); SIGUIENTE 48-52 px | B |
| online-noacc, online-off | 8 | Botón dentro del panel bajo el texto; panel a `--ph-fw` centrado | B |
| online-nortc | 7 | Botón «Copiar enlace» 48 px en el panel | B |
| online-room, online-room-rival | 8 | Mantener; reglas a `--ph-label` en una fila de iconos; una sola salida (SALIR) en .ph | B |
| (vertical) home / jugar a 390x844 | — | `.pv` + `.ph-sticker` para los dos sellos; Volver de Jugar abajo a la izquierda 48 px; Carrera en vertical → aviso #rotate | M |

### 5.2 Carrera: marco del hub y Partido [carrera-marco]

| id | nota | cambios | prio |
|---|---|---|---|
| (todas las carrera-* con hub) | — | Raíl 64 px / 5 apartados / Mensajes a la cabecera / «‹ Menú» pin 44 / tira 40 px con chevrones y activa centrada / sello repetido fuera / «?» dentro del sello / un punto rojo por nivel / `.cr-body` padding-top 10, 14 px entre tarjetas, degradado 24 px / dock §3.7 con padding inferior | A |
| carrera-playa-match, carrera-pista-match | 4,5-5 | Fuera el título «JUGADOR / CLUB» (o 1 línea `--ph-head` con elipsis, `shortClub`); ticket compacto (escudos 40, rival 18 px, meta en 1 línea «J5/14 · Sets a 21 · 8º · IA Fácil» sin elipsis; ~96 px); avisos (prensa, mensajes, baja, semana) como columna/fila de pastillas de 44-48 px (icono + 1 línea + ›), sin colas; la baja una sola vez; tarjetas Rival/Selección dentro del scroll con padding = dock+12; dock: JUGAR principal, SIMULAR sp-md 44 | A |
| carrera-playa-partido-baja, carrera-pista-partido-baja | 4 | Dock: «Ver la jornada» principal en 1 línea, «Baja» sp-md con icono; fuera la ficha «De baja: 3 partidos»; texto de baja en ≤ 2 líneas; liga/sets como pie de 1 línea; mentor `.cw-mentor` compacto | A |
| carrera-playa-informe-tira, carrera-pista-informe-tira | 4 | INFORME DEL RIVAL como chip 36-40 px dentro del ticket («Informe · Te tienen estudiado»); columna de avisos → fila de chips; cabecera en 1 línea | A |
| carrera-pista-natl-tarjeta | 4 | Con convocatoria, franja de 56 px «Convocado · Europeo VEC · ESP contra ROU · Ver» justo bajo el ticket; avisos repetidos fuera; 12 px entre `.st-chips` | A |
| carrera-pista-cesion-aviso | 4 | Avisos que piden decisión (cesión, puesto, convocatoria) en una franja fija bajo el ticket, uno a la vez, con su botón | A |
| carrera-pista-propuesta-puesto | 4 | Dock = Aceptar (principal) + Rechazar (sp-md); consecuencias como 2 fichas verde/roja; plazo en el sello; 2 viñetas | A |
| carrera-playa-estrellas-voto, carrera-pista-estrellas-voto | 5 | «Pedir el voto · 2/3» sp-md 48 px en 1 línea con coste como ficha; barra 14 px con rótulo «Top 4»; votos/cierre a 13 px en la fila de «Vas 11º»; la tarjeta sube tras el partido (o franja de 56 px) | M |
| carrera-playa-natl-verano | 3 | Mentor en franja de 56 px (× de 44); dock «Jugar · ESP contra ROU» + Simular; «Ver ofertas» como enlace sp-sm en la tarjeta; «Ver torneo» enlace | A |
| carrera-pista-gala | 3 | Mentor en cola durante la gala; premios arriba (fila por premio, tú en dorado); dock «Seguir» + club en small, 1 línea, lh ≥ 1.1; objetivo/entrenador como 2 fichas | A |
| carrera-playa-fin-cesion | 3 | `.cw-mentor` en .ph: botones debajo del texto (× 44 en la esquina, «Ver entreno» sp-sm), texto ≤ 2 líneas a todo el ancho; objetivo en 1 línea con ficha, resto tras «?» | A |

### 5.3 Carrera: Jugador, Club, plan, selección, lesiones, cesiones y traspasos [carrera-jugador-club]

| id | nota | cambios | prio |
|---|---|---|---|
| carrera-playa-player-phys/def/atk, carrera-pista-player-phys/def/atk | 5,5-7 | Cabecera `.cr-pcard` en 1 línea «Nv 2 · 92/152 XP · [4 puntos]» con barra de 4-6 px (sin nombre); `.attr` min-height 52 con 8 px de gap (fin de +1 pegados); 2 columnas también a 568; «Entreno: Equilibrado · 60/100» + ⓘ. (Opcional si cabe: fundir Físico/Defensa/Ataque en «Atributos» solo en .ph; decidir al implementar viendo capturas) | M (pista def/atk: B) |
| carrera-playa-player-badges, carrera-pista-player-badges, carrera-playa-saque-firma | 3-4 | Tarjeta de saque = nombre (16 px) + 1 dato («Va en GOLPEAR» / «🔒 Pide saque 62»); detalle y «Elegir» (48 px) en hoja; `.ph-grid2` (3 a `.ph-w`) de 64 px sin cola, gap 10; bloqueadas opacidad .7 + candado legible; intro tras ⓘ; Gesto: `.seg` 44 px gap 8, visible a 844 sin scroll; **arreglar el texto que se sale del brochazo** (`.cr-sig-l>.sp-btn.sp-wrap`: padding-inline 18, sin giro que desplace) | A |
| carrera-playa-player-train, carrera-pista-player-train | 5 | Dock «Plan del entrenador ›» 48 px a la derecha o sp-sm en la fila del sello; padding inferior = dock+12; «Lesiones Sí/No» a Vida › Opciones; sello 36 px con «?» dentro; Volver antes / Fisio en fila de 2 a 52 px con coste en chip | A |
| carrera-playa-player-look, carrera-pista-player-look | 6-6,5 | Una fila: miniatura + «67/155 · 2 nuevos» + botón «Vestuario ›» 48 px; frases tras ⓘ; chips fuera | M/B |
| carrera-playa-club-info, carrera-pista-club-info | 5,5-6 | Escudo 56-64 px, nombre `shortClub` a 20 px + patrocinador a `--ph-cap`; datos como `.ph-kv` (2 col a 568, 3 a `.ph-w`, filas 40 px); Objetivo y Tu puesto primero; detalles largos tras ⓘ; colores como 3 puntos | M |
| carrera-pista-club-team | 5 | Filas de 44 px en 1 línea (nombre · dorsal · media tabular · punto de forma · T/S); puestos como cabecera sticky de 28 px; «Tu puesto: 4º de 4» como pastilla arriba, tu fila resaltada; leyenda tras ⓘ | A |
| carrera-playa-club-mate | 4 | Sin sello; avatar 48, nombre 18 px, chips en una fila (Rol · Media · Forma); Química con barra 8 px en la primera pantalla; párrafos tras ⓘ | A |
| carrera-playa-club-contract, carrera-pista-club-contract | 4-6 | Sin sello; `.ph-strip`/rejilla de 3 col × 40 px (Rol · Quedan · Sueldo / Ahorros · Firmado); 1 línea de rol + ⓘ; dock 48 px con padding inferior | A (pista: M) |
| carrera-playa-club-offers, carrera-pista-club-offers | 5-6 | Oferta de ~88 px (escudo 40 + nombre + «Regional · Media 35»; chips en 1 fila; «Ir cedido» sp-md 48 a la derecha); «?» 44 dentro del sello; vacío en 1 línea + ⓘ; deshabilitado con motivo dentro | M |
| carrera-playa-club-people, carrera-pista-club-people | 5-6 | Sin sello; filas de 56-72 px (nombre + rol, cifra grande a la derecha con barra 6 px y «+2 ▲»); cita/cambio al tocar o en 1 línea; 2 col a `.ph-w` | M/B |
| carrera-playa-club-ficha, carrera-pista-club-ficha | 5 | «‹ Clubes» como pin 44 (sin bocadillo de fila propia); escudo 44-64, nombre `shortClub` `--ph-head`, «Regional · 1987 · apodo» en 1 línea; chips en 1 fila; «Esta temporada» sube a la cabecera (a la derecha del escudo a `.ph-w`) | M |
| carrera-playa-club-rencor, carrera-pista-club-rencor | 4,5-5 | Lo de la ficha + rencor como franja/chip rojo bajo el nombre con motivo de 1 línea a 13 px `--sp-ink2`, visible sin scroll a 568 | A (pista: M) |
| carrera-pista-club-natl, carrera-playa-club-natl, carrera-playa-club-natl-verano | 3 | Franja de selección de 44 px (bandera 28 · «ESPAÑA · Titular» · «Confianza 56», resto tras «?»); el partido en grande primero («Grupo B · 2ª jornada · ESP contra ROU»); fila de torneo como pie de 13 px; tabla del grupo a 4 filas de 36 px; sello de torneo corto; «Pareja 1» una vez | A |
| carrera-pista-club-natl-clasif | 3 | Franja de selección 44 px; tabla con thead sticky y filas de 36 px, `SP.reveal` de España; dock con rival en small | A |
| carrera-playa-lesion, carrera-pista-lesion | 6 | Cuerpo de 40 px dentro del sello; barra + «Vuelves en 3» en una fila; rehabilitación tras «?»; Volver antes / Fisio intensivo sp-md 48 en fila visible; dock oculto o «Fisio intensivo» | M |
| carrera-pista-cesiones, carrera-playa-cesiones | 4-5 | Motivo del bloqueo como ficha roja arriba; botón desactivado 48 px ancho auto junto a «No gracias»; condiciones en tira de fichas 1 línea; nombre `--ph-row` con elipsis; «?» dentro del sello; fichas a 13-14 px | A (playa: M) |
| carrera-pista-traspaso-renovar | 4 | Propuesta arriba («Renovación: 2 temp. · 1.100 €/mes · Titular» con diferencias en verde/rojo); contrato actual en `.ph-strip`; sin sello; «Prefiero salir» sp-md sin cola | A |
| carrera-pista-traspaso-no | 4 | Mensaje del club en franja de 56 px; consecuencia de Insistir en small; Insistir sp-md neutro | A |
| carrera-pista-cedido | 5 | Sello «CEDIDO» a secas; 4 cifras en `.ph-strip`; «Vuelves a…» y «No recibes ofertas» en 1 línea + «?» | M |
| carrera-playa-plan | 3 | Cabecera de tarjeta en 1 fila de 44 px (sello «PLAN · sin plan» con «?» dentro, Cerrar como × 44); opciones en una columna de filas de 52 px, gap 10, atributos abreviados sin elipsis («Rec 42 · Def 39»); elegida con marco dorado + check; «Recomendado» como estrella; dock «Confirmar plan» solo con algo elegido | A |
| carrera-pista-pedir-puesto | 4 | Misma cabecera; «Ahora: Receptor · encaje 86 %» arriba; filas 52 px con barrita de encaje; dificultad solo si cambia; elegida sin cola; dock «Pedir Opuesto» | A |
| carrera-ofertas-rencor-playa, carrera-ofertas-rencor-pista | 5 | Ver 5.5 (plantilla `.offer-full`) + rencor como ficha con «?» que abre hoja con su efecto | M |

### 5.4 Carrera: Liga, Vida, Vitrina, premios, Mensajes [carrera-liga-vida]

| id | nota | cambios | prio |
|---|---|---|---|
| carrera-playa-inbox, carrera-pista-inbox | 6,5-7 | Fuera la cabecera verde (el «4» como insignia de BANDEJA); filas de 52-64 px con gap 4 (no pegadas), avatar 36-40, nombre `--ph-row`, avance `--ph-body` 1 línea, «T1 J4» a `--ph-micro` | M |
| carrera-playa-inbox-wall, carrera-pista-inbox-wall | 5,5-6 | Sin sello REDES; frase como subtítulo de 13 px; 3 tonos en una fila de 3 columnas de 64-72 px (efectos como ▲▼), gap 10, sin cola; feed visible en la primera pantalla | M |
| carrera-playa-league-table, carrera-pista-league-table | 4-5,5 | Filas de 36 px (40 si tocables), sin caja por fila (rayado), escudo 20-24; thead sticky opaco con z-index y `scroll-padding-top`; marcas de zona como línea de color; a 568 columnas # Club PJ G P Pts; tu fila centrada | A (playa: M) |
| carrera-playa-league-cal, carrera-pista-league-cal | 6,5-7 | `.st-cal-tag` a `--ph-micro` (12) padding 2×7; filas 40 px gap 4, align-items:center; fuera «Pendiente»; padding-top 8 + desvanecido arriba | M/B |
| carrera-pista-league-cups | 6 | Sin sello; 3 filas de 48 px (trofeo 24, nombre, requisito `--ph-cap`, tu estado a la derecha) | B |
| carrera-playa-league-news, carrera-pista-league-news | 6-6,5 | Sello solo con la liga o fuera; «J4» como columna de 32 px; titular a `--ph-body` máx. 2 líneas; gap 10; leídas en tinta oscura, nuevas en crema | M/B |
| carrera-playa-league-clubs, carrera-pista-league-clubs | 6 | Fuera el encabezado duplicado («Hiperliga 2 · 12» dentro del selector de 44 px); filas de 48 px en 1 línea (escudo 24-32, `shortClub`, «1º · 62» tabular, ›); estrellas a la ficha | M/B |
| carrera-playa-league-race, carrera-pista-league-race | 3 | Fuera la tarjeta «Carrera por los premios»: segmentado MVP/Joven/… como fila sticky de 44 px con el «?» al final; fuera el sello «MVP»; filas de 48 px en 1 línea (puesto 32 · flecha 16 · nombre 16 px · club 13 px elipsis · nota); tu fila fija abajo si no se ve | A |
| carrera-playa-premios-datos, carrera-pista-premios-datos | 3 | Lo de league-race + tu fila siempre visible (48 px, «Tú · fuera del top 2»), tendencia como flecha de color | A |
| carrera-playa-honors-titles, carrera-pista-honors-titles, carrera-pista-natl-palmares, carrera-playa-estrellas-vitrina, carrera-pista-estrellas-vitrina | 4-5 | Rejilla de 5 por fila a 568 y 6-7 a `.ph-w`, iconos 40-56 px, rótulo `--ph-cap` ≤ 2 líneas con nombre corto (completo al tocar); vacíos al 40 % sin círculo discontinuo; encabezados de categoría en línea (24 px, sticky); categorías vacías plegadas en 1 línea; fuera el sello «VITRINA (0 de N)» (contador como ficha) | M |
| carrera-playa-honors-seasons, carrera-pista-honors-seasons | 5 | Fusión con Vitrina se mantiene; chip ancla «Temporadas ↓» en la Vitrina con encabezado sticky (o remitir a Cifras «Por temporada»); mobaudit hace scroll al ancla | B |
| carrera-playa-honors-stats, carrera-pista-honors-stats | 5-5,5 | Primero la tira de 4 cifras de carrera (64 px, `--ph-num`), luego la tabla por temporada con `shortClub`; «Ver tabla completa ›» sp-sm 44 a la derecha del encabezado; PG como ⓘ en la cabecera | M |
| carrera-playa-honors-opts, carrera-pista-honors-opts | 4,5-5 | Una sola tarjeta con filas de 52 px «Dificultad [seg]», «Cuánta vida [seg]», «Lesiones [Sí/No]»; `.seg` 44 px gap 8; frase corta del nivel elegido + reglas tras ⓘ; sin sello por sección | A (pista: M) |
| carrera-playa-life-fame, carrera-pista-life-fame | 6 | «?» 44 dentro del sello; bloque de seguidores ≤ 140 px (2 filas: «117 seguidores · Desconocido» + barra 8 px con «→ Promesa local, faltan 383»); Celebración en la primera pantalla | M |
| carrera-playa-life-legacy, carrera-pista-life-legacy | 6 | Fusión con Fama se mantiene; chip ancla «Legado ↓» en la fila del sello con encabezado sticky; corregir id de mobaudit | B |
| carrera-playa-life-shop, carrera-pista-life-shop | 5-6 | Un encabezado «Material · Ahorros 1.300 € · ?»; filas de 52-56 px (nombre + efecto; botón sp-sm 44 «1.500 €»); desactivado legible (opacidad ≥ .7, «Faltan 200 €»); niveles como «Nv 0/3» | M |
| carrera-playa-life-goals, carrera-pista-life-goals | 5-5,5 | Tarjeta de 3 líneas (~64-96 px), barra 6 px con «4/10 · +1 punto» en 1 línea; 2 columnas también a 568; intro tras ⓘ; contador como insignia de la pestaña; cercanos primero, completados plegados | A (playa: M) |
| carrera-playa-life-pass, carrera-pista-life-pass | 6-6,5 | Resumen en 1 línea «Nivel 0/20 · ★ 2/60 · falta 1» + barra 8 px (sin tarjeta crema ni línea repetida); camino como tira horizontal de fichas 56-64 px con el nivel actual centrado; niveles sin premio como puntos de 20 px | M/B |
| carrera-pista-estrellas-finde, carrera-playa-estrellas-finde | 4 | Concurso como fila compacta (título + estado en la misma línea, marca a 13 px, podio en 3 fichas de 14 px); «Ver los 6»/«Ver resultado» sp-sm 44 a la derecha → 2 concursos a 568 | M |

### 5.5 Carrera: creación, juvenil, prueba, ofertas, informes y hojas de partido [carrera-flujo]

| id | nota | cambios | prio |
|---|---|---|---|
| carrera-crear-playa, carrera-crear-pista | 3-4 | Segmentado Playa/Pista sale de la tarjeta CARRERA a la cabecera (píldora de 2 de 44 px, gap 8); fuera la tarjeta CARRERA; tarjetas en `.ph-grid2` (Nombre \| Dificultad…) padding 10, gap 8, etiqueta inline 12 px; contador/índice de pasos sobre el dock; dock 48 px ancho auto «CREAR JUGADOR» (resto en small); padding inferior = dock+12; **Nombre y Dificultad visibles sin scroll a 568**; pista: país como fila «País: España ▸» que abre `SP.sheet` con continentes en pestañas | A |
| carrera-crear-juvenil | 4 | INICIO justo tras Nombre, a ancho completo (grid-column 1/-1); opciones como filas de 56 px (título 16 + 1 línea 13 px), detalle tras ⓘ | A |
| carrera-a-medias | 7 | Botón al dock estándar; nota «Se guarda cada punto» 12 px; marcador a 22 px | B |
| carrera-ofertas-playa, carrera-ofertas-pista | 6 | Cabecera del club en 1 línea de 44 px (escudo 32 + nombre + estrellas); `.ph-strip` de 4 cifras 52 px; 3 chips de resumen visibles sin scroll (Estilo · Compañero · Rol) con detalle tras ⓘ; tira de clubes con desvanecido + «1/4»; sello de media fuera de la tira; «Pedir ser titular» sp-md 44 sin cola | M |
| carrera-playa-informe, carrera-pista-informe | 5 | Modal §3.8 (pantalla completa inset 8, opaco, capa .7, solo ✕ 44); Ellos/Saque/Tú como encabezado inline 12 px; chip «Te tienen estudiado» en línea propia; opcional: JUGAR PARTIDO en el propio informe | M |
| carrera-juvenil-intro-playa, -pista | 6 | Tarjeta del jugador en 1 línea (avatar 36); opciones con gap 10 y descripción 13 px ≤ 2 líneas; premio como chip en la pregunta; «Ir directo a las pruebas» como botón fantasma pequeño arriba a la derecha | M |
| carrera-juvenil-intro3-playa, -pista | 8 | ATRÁS como sp-md 44 discreto (u oculto en .ph) | B |
| carrera-juvenil-temporada-playa, -pista | 5 | Tarjeta de jornada en 3 filas compactas (escudos 28, «J3 · A vs B», «1 set a 15 · IA Fácil», objetivos como chips 32); mensaje del entrenador a CHAT o 1 línea; TUS PARTIDOS asomando 2 filas de 40 px; SIMULAR sp-md 44 sin subtítulo | M |
| carrera-juvenil-equipo-playa, -pista | 5 | Una tarjeta-lista con secciones inline de 12 px; filas de persona de 56 px en 1 línea, bio en acordeón; a `.ph-w` 2 columnas | M |
| carrera-juvenil-chat-playa, -pista | 6 | Avatar 28, nombre en la línea del mensaje, burbuja sin borde padding 8×10, gap 6; mensajes seguidos sin repetir avatar | B |
| carrera-juvenil-informe-playa, -pista | 6 | Cifras + círculo Promesa (52 px, dentro de la tarjeta) en una banda de 56 px; «?» como ⓘ en la cabecera; frase en 1 línea; INVITACIONES visibles sin scroll en filas de 44 px | M |
| carrera-prueba-previa-playa, -pista | 6 | Cabecera de 56 px (escudo 36, nombre 22 px); objetivos en minúsculas 14 px, chips de 40 px de una línea; «1 set a 15 · con petos» bajo los objetivos; fuera la frase del cuerpo técnico; todo sin scroll a 568 | M |
| **Patrón hoja de partido (#end) en .ph-s** | — | Columna izquierda: antetítulo corto en 1 línea («Regional · J3/14», `data-ph-short`), título ≤ 2 líneas (clamp 22-28), marcador y sets, debajo bloque secundario (objetivos / Tu partido / Ver celebración / Cambiar opciones) y MENÚ fantasma 44 px; panel derecho ordenado recompensa/progreso → tu partido → MVP, MVP en 1 línea con «·» o chips 2×2, fuera la frase anecdótica del punto final; si queda scroll interno, sombra + ▾ | — |
| carrera-hoja-final | 5 | Patrón hoja; TU PARTIDO («Lo mejor»/«A mejorar» como 2 filas de chips de 28 px) visible sin scroll y antes que MVP | A |
| carrera-natl-partido-hoja | 5 | Patrón hoja; antetítulo «Continental · Clasif. 2/3» | A |
| carrera-natl-partido-hoja-derrota | 5 | Patrón hoja; título clamp o «GANA DOM»; **verificar** incoherencia título/marcador (fixture `debug=over&ext=natl&k=loss` o fallo real) | M |
| carrera-estrellas-concurso-hoja | 5 | Recompensa en franja fija bajo «20 de 30» (chips «+600 €», «+160 seg.», «Pañuelo»); clasificación top 3 + tu fila (22 px) y «Ver todo»; 2º INTENTO en el dock, SIGUIENTE sp-md 44, VOLVER fantasma arriba a la izquierda | A |
| carrera-estrellas-partido-hoja | 5 | Fuera el marcador repetido del panel (o nowrap); recompensa primero; «Nota 7,8 · MVP: tú» en 1 línea; celebración como chip 40 px; verificar sets 25-15 vs 21-18 | M |
| carrera-juvenil-hoja | 6 | Patrón hoja; chips de objetivo nowrap con texto corto («≤ 2 errores»); verificar cabecera 2-0/25 vs panel 15-11 | M |
| carrera-prueba-hoja, carrera-prueba-suspendida | 5 | Patrón hoja; «Te ficha 1 temporada» y nota en el sello; 3 objetivos en chips de 32 px en la columna izquierda; antetítulo en 2 líneas cortas; suspendida: «Te quedan 3 ofertas» como chip destacado, marcador «Tú 0-1 Titulares» | M |
| carrera-resumen-jornada | 4 | Orden: PROGRESO (fila 36 px «+184 XP ▬ ¡Nivel 7! +3 pts») → MVP 1 línea nowrap+elipsis («Ares Belmonte · 24 pts · Nota 7,8») → CLASIFICACIÓN 3 filas; fuera la frase del punto final | A |
| carrera-resumen-stats | 6 | Dorsal 32 px, filas 44, MVP como chip junto al dorsal (no vertical), totales sin degradado (padding inferior) | B |
| carrera-sesion-hoja | 7 | Medallas en una fila de 32 px junto a la nota; VOLVER fantasma 44; barra de SAQUE 16 px | B |
| carrera-banquillo | 7 | Una barra inferior derecha de 44 px [×3] [Saltar hasta entrar] [⏭ Final] gap 8; «En el banquillo» como chip junto al marcador | B |
| carrera-previa | 8 | Píldoras a 14 px; bloque central 30 px más abajo | B |
| carrera-previa-arbitro | 7 | Píldoras con flex-wrap (una por dato, max-width 100 %); texto del árbitro abreviado | B |

### 5.6 Ajustes, controles, vestuario, perfil, retos y cuenta [paneles]

| id | nota | cambios | prio |
|---|---|---|---|
| ajustes-audio, -image, -cam, -game, -a11y | 5-6 | `.ph-bar` (icono ‹ 44 + raíl de pestañas debajo empezando sin nada encima); raíl de 7 pestañas a 44 px con gap 6 (7×44+6×6 = 344, cabe a 390) y solo iconos de 56 px a `.ph-s`; panel a todo el ancho restante; filas de 52 px con descripción en 1 línea + ⓘ en toda fila recortada; textos cortos (`Cámara 6v6`, `Ambiente`, «De 1 (cerca) a 5 (lejos)»); «(ahora: …)» pasa a la etiqueta del valor («AUTO·media»); selector compacto (flechas 44, valor min 64; ~160 px); grid «tit ctl / desc ctl» para que el título no parta; toasts §3.10; chevron `sp-more` fuera del panel | A (cam, a11y: M) |
| ajustes-kit | 6 | Muestras 40 px (área 44) gap 6 con flex-wrap; título y muestras en la misma línea a `.ph-w` (grupos de ~56 px); enlace «Más en Vestuario ›» solo si Ferran lo aprueba (no cambiar contenido) | M |
| ajustes-info | 6 | Las 3 filas pulsables arriba (52 px, descripción 1 línea); Versión/Progreso en una línea de 32 px sin fondo al final | B |
| controles-keyboard, controles-gamepad | 4-5 | `.ph-bar` con ‹ + pestañas Táctil/Teclado/Mando (sin título CONTROLES); 2 columnas también a 568, filas 48 px, teclas 40 px (área 44) con 8 px; ayuda en la línea del título en gris; Zona muerta a ancho completo al final (slider 44 px) | M (gamepad: B) |
| controles-touch | 5 | Misma cabecera; filas de 52 px; a ≥ 740 px de ancho Tamaño/Disposición a toda la fila y las acciones en 2 columnas; «Editar disposición» como botón primario de 48 px con icono; segmentos 100/115/130 con gap 10 | A |
| controles-touch-editor, controles-touch-editor-zurdos | 3-4 | Panel `vte-in` → barra de una fila de 52 px arriba en el centro: [botón seleccionado] [Tamaño] [Opacidad] [⇄ 44] [↺ 44] [✓ Listo]; «Arrastra…» solo hasta el primer arrastre; regla: la barra no tapa ningún `vt-btn` (getBoundingClientRect al soltar; si choca, al borde contrario); en `.mirror` a la derecha; `.vt-tip`, `.vt-set span`, `.vt-zoom b` ≥ 12 px (comprobar también en partido) | A |
| vestuario-pelo, -cabeza, -cara, -cuerpo, -brazos, -piernas | 5 | (componente `#mpLook`) Cabecera de una fila también a 844/915 (‹ \| PELO \| Jugador 1·2 \| Pista·Playa con etiqueta); `#lkPick`/`#lkVen` ≥ 44x44 gap 6-8; `#lkTabs` 7×44 gap 6; filas de 52 px «Peinado · Tupé» (etiqueta 13 amarilla, valor 15, flechas 44), sin «::N»; valor con elipsis (min-width:0); lista minmax(320px, 46vw) pegada al avatar; muñeco y botones laterales intactos | A |
| vestuario-colores | 4 | Lo mismo + fuera «Pinta: X» cuando repite el título; muestra de color junto al valor en la misma línea | A |
| perfil-vestuario, perfil-insignias, perfil-entreno, perfil-carrera, perfil-retos, perfil-sedes, perfil-hitos | 4-5 | Rejilla de 4 columnas a 568 y 6 a `.ph-w`, baldosas de 64-80 px (icono 20-28, nombre 13 px ≤ 2 líneas); raíl de pestañas de una línea «Vestuario 6/91» (contador como chip), 40-44 px, gap 4-6, **corregir el rótulo que se sale del parche** (padding-top/line-height); XP como tira de 44 px con los 3 iconos etiquetados; «Elige un hueco…» como texto vacío de la ficha; toasts arriba-centro y efímeros; insignias/entreno: una baldosa por prueba con 3 puntos bronce/plata/oro; punto de novedad dentro (top 6, right 6); sufijo «(pista)» como icono; retos: enlace a Retos › Maestría en la ficha | A (retos, sedes, hitos: M) |
| perfil-cuaderno | 5 | Lo mismo con pictogramas de 28 px; seleccionada con borde amarillo 3 px + rotación | M |
| perfil-cuaderno-pie | 4 | Detalle como hoja lateral derecha (~40 %) o padding-bottom = alto del pie; baldosa descrita marcada; «Vista el…» en línea gris, regla ≤ 2 líneas + «más» | M |
| retos-hoy | 5 | `.ph-bar` con ‹ + 3 pestañas (gap 8, sin título RETOS); sede en 1 línea `--ph-head` con elipsis; chips en una tira nowrap con overflow-x; fecha dentro del sello; en `.ph-s` grid «day tiers / day go» con ¡A JUGAR! en la columna derecha (no sticky); a ≥ 740 columna de medallas minmax(220px,1fr) | A |
| retos-maestria | 4 | Misma cabecera; filas de 52 px (medalla 32, nombre 15, progreso 13 «récord 0 · bronce 2»), 2 columnas a ≥ 740; cabeceras de sección sticky; borde rasgado más fino | M |
| retos-semana | 5 | Misma cabecera; mapa height min(100%, 46vh) entero con RED; texto de compartir en la acción; «Mapa del grupo» a `--ph-label` dentro del panel; Saque/Ataque como `sp-tab` 44 sin text-shadow; puntos y «Aún sin jugar» dentro de la tarjeta | M |
| retos-semana-grupo | 4 | Segmento «Mapa \| Grupo (3)» de 44 px en la columna derecha (una cosa a toda la altura); compartir en la fila de ¡A JUGAR! con gap 8 | M |
| cuenta-entrar, cuenta-crear | 6 | `:focus-within` oculta pestañas, Google y separador; campos de 44 px con placeholder corto y `autocomplete`/`inputmode`; 2 columnas también a 844/915; `#btnVer` oculto con `#account` abierto; CREAR CUENTA a ancho de columna | M (crear: B) |
| cuenta-dentro | 7 | «Sincronizar ahora» junto a «Nube · hace 2 min»; «Cerrar sesión» sp-btn secundario 44 | B |
| cuenta-borrar | 7 | Aviso a todo el ancho bajo la tarjeta de usuario (3-4 líneas); botones igual | B |

### 5.7 Partido: HUD, pausa, cambios, final, estadística, semana [partido]

| id | nota | cambios | prio |
|---|---|---|---|
| hud-sena, hud-sena-bajo, hud-sena-5s, hud-sena-cinta | 3-4 | En .ph la seña (`#pbug>.sp-sena`) va bajo el marcador en la columna izquierda (left 16, 56 px, rotada), no colgada de `#pbug`; «⇄ Saque» como 2ª línea pequeña dentro de la pestaña; `#prompt` «Espera el silbato» a la mitad de abajo (≈40 px sobre el borde, encima del sacador); con seña o cinta puesta se oculta «● Punto de set»; a 844 margen de la pegatina ≥ 0 (no −0,2·sn); en playa `.sn-w` con borde de tinta 3 px; cinta: o se mueve `#prompt` o la pegatina a la izquierda de la cinta. Probar a 568 los 4 ids | A |
| hud-punto | 5 | Etiqueta «● PUNTO DE SET» oculta mientras está la cinta grande; «Espera el silbato» abajo; marcador a escala .85 en `.ph-s` | A |
| hud-2v2, hud-saque-firma, hud-entreno | 6-7 | Marcador sin rediseño, escala .85 en `.ph-s`; aviso del saque en la franja de abajo entre joystick y SALTAR también a 568, en 1 línea («SACAR flotante · SALTAR potente»; firma con su icono en el chip SACAR); Pausa↔Zoom gap 12, insignia del zoom dentro del círculo | A (entreno: B, firma: M) |
| hud-2v2-zurdos | 7 | ⇄ con ≥ 24 px de separación vertical de GOLPEAR; consejo compacto como peloteo | B |
| hud-2v2-peloteo, hud-6v6 | 6 | Consejo en 1 línea (chips 12 px + texto 14 px, máx. 55-60 % de ancho) pegado bajo la tira de fases; tira de fases 30 px; 6v6: botón de bloqueo/⇄ opacidad ≥ .6, 56 px, 24 px sobre GOLPEAR | M |
| partido-frenar-playa, partido-frenar-pista | 5-6 | Durante la decisión: seña y «⇄ Saque» retrasados, cinta en 1 línea sin subtítulo, JUGADA oculta; bloque de decisión en la franja de abajo entre pulgares: pregunta 16 px, 2 botones 160×52 con gap 16, barra de tiempo 6 px | A (pista: M) |
| hud-cambio | 5 | En `.ph-s` tarjeta CAMBIO como pastilla de 36 px «CAMBIO ▲8 ▼4 · 1/6» bajo el marcador a la izquierda; «Challenge 4» a 32 px / 14 px | M |
| hud-zona, hud-zona-6v6 | 6 | Con la cinta de zona en pantalla se oculta la tira de fases; barra de zona sin texto (icono de llama) 24 px; «RACHA» como icono 12 px junto al nombre | M |
| previa, semana-previa | 7-8 | Kicker y aviso a 14 px; tira de datos 8 px más abajo; 12 px entre tira y «Toca para empezar»; semana a 568 sin el pabellón en el kicker | B |
| pausa | 5 | Mantener estructura; Sugerencia+Bug → un botón «Opinar» (abre el panel con las 2 pestañas); Reiniciar y Salir en oscuro con borde de color (no relleno verde) a la columna izquierda; a la derecha Controles/Ajustes sobre SEGUIR JUGANDO; gap 12; tarjeta del marcador fit-content; kicker 13 px con margen 6 | A |
| semana-pausa | 4 | Lo de pausa + kicker en 1 línea con elipsis («Situación · 24-22»); aviso «gasta este intento» como texto 13-14 px con ⚠ sin caja; Otro intento/Salir a la izquierda | A |
| pausa-controles | 4 | `.ph-bar` con ‹ + pestañas; en táctil solo la pestaña Táctil y «Otros mandos ›» al final; segmentos gap 10 | A |
| pausa-bug | 3 | Como opiniones-bug (§5.1): cabecera de una franja, textarea flex:1, Enviar a la derecha, sin Cancelar, con foco se oculta todo lo demás (visualViewport) | A |
| pausa-ajustes | 4 | Como Ajustes (§5.6) + pestañas como iconos 56 px; en pausa solo Audio, Cámara, Juego y Accesibilidad | M |
| cambios-6v6, cambios-6v6-elegido | 4 | Pista como rejilla 3×2 de fichas 76×56 (4-3-2 / 5-6-1: número, rol, energía como borde inferior 4 px), banquillo en tira de 6 fichas; todo sin scroll; fuera «pts/err» de la ficha; ayuda corta en la cabecera («6/6 · sale → entra» / «Ahora elige quién entra por el 1»); marco 12 px; no compatibles opacidad .35 con rol tachado, válidos con borde verde | A |
| final-resumen | 5 | «Ver celebración» y «Cambiar opciones» a la columna izquierda bajo los sets como botones de 44 px (igual en las 3 pestañas); tarjeta derecha sin scroll; MVP en chips 2×2 sin «|»; «Más difícil» oscuro con borde verde; fila de abajo intacta | A |
| final-primero | 4 | «Y ahora» (Carrera, Vestuario, Cuenta) a la columna izquierda como chips de 40 px gap 10; tarjeta derecha desde arriba sin scroll automático; «Cuenta» solo sin sesión; «Más difícil» oculto en la primera partida | A |
| final-stats | 5 | Barra «Puntos 51-36» primero; MVP en filas de 40 px con cabecera «Pts»; «Ver todo ›» al pie (no icono en la esquina); cifras 15 px | M |
| final-jugadas | 6 | Fuera el subtítulo; fila entera como botón (▶ 40 px + «Bloqueo del n.º 1 · 2º set 9-6»), 48 px, gap 8 | M |
| final-reto | 5 | Medallas en una fila (la conseguida 40 px); «¡Plata! +55 XP» en 1 línea sin «(a cada jugador)»; MVP a Cifras en esta variante; fuera la frase del final | M |
| final-entreno | 7 | Fuera «Oro: 24 puntos»; Siguiente y Entrenamiento como secundarios oscuros iguales en una fila de 48 px a la izquierda; REPETIR igual | B |
| semana-hoja | 4 | Enviar y Grupo a la columna izquierda (44 px); abajo Menú y OTRO INTENTO; marcadores en `.nw`; título «¡SALVADA!» sin resultado; MVP fuera en esta variante | M |
| estadistica-2v2, estadistica-6v6 | 3-4 | `.ph-bar` con «Estadística» 24 px; filtros en fila sticky de 40 px (TÚ/CPU a la izquierda, chips de set 36 px a la derecha con overflow-x, sin bajar de fila); índice de secciones en chips (Cifras · Marcha · Jugadores · Rotaciones); KPIs en rejilla 3×2 de 64 px (número 24, etiqueta 13); sin marco exterior; 6v6: secciones largas plegadas por defecto | A |
| repeticion | 8 | Subtítulo a 14 px; a los 2 s la ficha deja solo la línea principal | B |

---------------------------------------------------------------------------------------------------------------------------------

## 6. Paquetes de trabajo (en serie sobre el mismo worktree)

1. `sistema` — tokens, componentes, utilidades, vertical, mobaudit.
2. `carrera-marco` — raíl, tira, sellos, dock, mentor; hub del Partido y decisiones.
3. `menus` — portada, Jugar, partido rápido, entreno, Cómo se juega, Jugadores, Acerca de, Opiniones, Instalar, Online, vertical.
4. `carrera-flujo` — crear, juvenil, prueba, ofertas, informe, hojas de partido de la Carrera.
5. `carrera-jugador-club` — pestañas de Jugador y Club, plan, selección, lesiones, cesiones y traspasos.
6. `carrera-liga-vida` — Mensajes, Liga, Vida, Vitrina, premios, Estrellas.
7. `paneles` — Ajustes, Controles (y editor), Vestuario, Perfil, Retos, Cuenta.
8. `partido` — HUD (rótulos), frenar, pausa, cambios, hoja final, estadística, semana.

Cada paquete: commit(s) en castellano con las líneas de atribución, sin push/merge/deploy, sin tocar la versión; al acabar, pasada de mobaudit
de sus ids a 568x320/844x390/915x412 (`--merge`) y de PC a 1280x720 (§3.14); anotar en este fichero, bajo «## 7. Registro», qué se hizo y qué
quedó pendiente.

## 7. Registro

### 7.1 Paquete `sistema` (24-nov-2026) — nombres exactos para los paquetes siguientes

**Tokens** (`index.html`, bloque `:root.ph{…}`; los de antes siguen igual salvo `--ph-cap`):
`--ph-cap` = clamp(13px, 11.4px + .29vw, 14px) · `--ph-micro` 12px · `--ph-gap-min` 8px · `--ph-btn-gap` 12px · `--ph-card-gap` 10px ·
`--ph-pad` 12px (10 en .ph-s) · `--ph-bar` 48px (44 en .ph-s) · `--ph-tap` 44px · `--ph-row-1` 44px · `--ph-row-h` 52px · `--ph-row-2` 64px ·
`--ph-row-t` 36px · `--ph-cta-h` 52px (48 en .ph-s) · `--ph-btn-h` 44px · `--ph-dock-h` = calc(var(--ph-cta-h) + var(--ph-gb) + 8px) · `--ph-fade` 24px ·
`--ph-stk` (alto de `.ph-sticker`: 64, 72 en .ph-w, 60 en .ph-s, 64 en .pv).

**CSS** (sub-bloque «— móvil (.ph) — «con aire»» al final del bloque del sistema, antes de `/* ==== fin SPLAT: sistema de diseño ==== */`):
- `.ph-only` (ya existía) / `.ph-no` (nuevo, = `.ph-hide`).
- `.ph-bar` con hijos `.ph-bk` (o el `.sp-back` de siempre: pierde bocadillo y texto) · `.ph-bt` (título, 1 línea) · `.ph-btabs` (pestañas) · `.ph-ba`
  (acciones 44 a la derecha). Solo el componente: cada paquete lo aplica y baja su panel a `top: calc(var(--ph-gt) + var(--ph-bar) + 4px)`.
- `.ph-sticker` (+ `.ph-stk-host` en el contenedor: position:relative y hueco a la derecha); vale con `html.ph` y con `html.pv`.
- `.ph-kv` (`<div class="ph-kv"><div><span class="k">Sueldo</span><b class="v">1.100 €</b></div>…</div>`), `.sp-heros.ph-strip`,
  `.ph-row` (`.ph-ri` · `.ph-rm` > `.ph-rt` + `.ph-rs` · `.ph-ra`), `.ph-grid2`, `.ph-btn-row`.
- `.ph-dup` / `.ph-dup-t` (los pone `SP.phDedupe`). `.ph-docked` (padding-bottom = `--ph-dock-h` + 12 en la zona que se desplaza bajo un dock fijo,
  p. ej. `#crDock`). `.ph-notail` (mancha sin goterón ni gotas).
- Dock genérico `.sp-dock` en .ph: gap `--ph-btn-gap`; `.sp-patch` máx. 62vw con `.sp-t` en una línea (lh 1.12); secundarios a `--ph-btn-h` sin cola.
  **`#crDock` de la Carrera no es `.sp-dock`**: lo hace `carrera-marco` (con `.ph-notail` / `.ph-docked`).
- `.sp-more` de `#panel.sp-pn` a `--ph-fade`. Hojas: fondo opaco (`--sp-ink` / crema en `.sp-paper`), capa `rgba(10,6,24,.7)`.
- Avisos `.sp-toast`: abajo en el centro sobre el dock (`bottom: calc(var(--ph-dock-h) + 8px)`), máx. 60vw. Las reglas por pantalla que ya los
  movían (online, Vestuario, Perfil) siguen mandando y llevan `translate:none`.
- `.sp-toggle` 52×30 con toque de 64×44 (`::after`); fila `.ph-trow` con `:active` visible. `.sp-seg` con gap `--ph-gap-min`.
- Suelo de 12: `.vt-tip` / `.vt-set` / `.vt-zoom b` también en el editor (`.vte`); `#career .st-cal-tag` a `--ph-micro`.

**JS** (`js/splat.js`, en `VB.Splat`): `toastClear()` (solo en .ph; ui.js `toastsOff()` lo llama en `setPage`, `openPanel`, `closePanel`) ·
`phDedupe(container, label)` · `phBar(bar)` (aria-label del ‹) · `pv()` y clase **`html.pv`** (pointer:coarse, ancho ≤ 500, alto > ancho; nunca
en PC) · `fitSeg` marca la fila del interruptor con `.ph-trow` (las `button.opt` ya cambian con su clic; en filas `[data-ph-trow]` que no son
botón, el toque en la fila cambia el interruptor) · `sheet()` sin acciones en .ph = sin «Cerrar» al pie (solo la ✕). `data-ph-short` ya se
aplicaba con `vb:ph` (`shorten`, sin cambios). ui.js `crPortrait()`: con `html.pv` y la Carrera abierta sale `#rotate` (sin parar nada; el partido
sigue con `ctx.portraitBlock` como antes).

**mobaudit**: zurdos solo en «-zurdos»; `carrera-*-inbox` fija Bandeja (`CR_TABS` 3.er campo); `league-clubs` llama a `CareerWorldUI.reset()`
(lista); `life-legacy` / `honors-seasons` capturan la vista fusionada desde arriba (el ancla la pone `carrera-liga-vida`); el interruptor se mide
por su fila; `.arr.end` = desactivada; métrica y columna **`rot`** (rótulos no tocables solapados) también en mobcompare.
**Ojo**: `antes/pc` se hizo con otra configuración (escala distinta a la de `--desktop --sizes 1280x720` de ahora): para la REGLA DE ORO
comparar contra una pasada de la base con el MISMO comando (`git stash` → pasada → `git stash pop`), como se hizo aquí (métricas idénticas).

**Pendiente para otros paquetes** (lo deja ver la pasada entera tras subir `--ph-cap`): ver §7.2.

### 7.2 Pendiente que deja el paquete `sistema` (pasada entera «despues», 24-nov-2026)

Pasada entera DPR 2 a 568/844/915 frente a «antes»: textos < 12 px 24 → **0**; < 14 px 5368 → 4321; toques < 44 89 → 63 (interruptores
`.sp-toggle` → **0**); solapes 131 → 107; fallos al abrir 0.
- Elipsis nuevas por `--ph-cap` 13-14 (no se baja la letra; se acorta el texto):
  - [carrera-marco] meta del ticket de pista a 568 (`.sp-tk-main>small.sp-k` «Hiperliga 2, Jornada 5 de 11, Sets a 15») en carrera-pista-match,
    -natl-tarjeta, -partido-baja, -cesion-aviso, -informe, -informe-tira → «J5/11 · Sets a 15» (§5.2).
  - [carrera-flujo] `#endKicker` «Juvenil | Jornada 2: el derbi» en carrera-juvenil-hoja a 568 → antetítulo corto con `data-ph-short` (patrón hoja).
- [partido] métrica nueva `rot` (antes no existía): `#touchbar`/`#coach` en hud-2v2-peloteo, hud-2v2-zurdos, hud-6v6; `#pbug`/`.sp-sena`/`#prompt`
  en hud-sena, -bajo, -5s, -cinta; `#touchbar`/`#banner` en hud-zona y hud-zona-6v6 (22 en total).
- [carrera-marco] `#crDock` no es `.sp-dock`: el secundario SIMULAR sigue con cola y el scroll sin reservar el dock (usar `.ph-notail` y `.ph-docked`).
- [carrera-liga-vida] ancla de Legado / Temporadas en la vista fusionada (las filas de mobaudit capturan la vista desde arriba).
- [menus] home/jugar: aplicar `.ph-sticker` a los sellos (también con `html.pv`); entreno: `.ph-bar` y rejilla.

### 7.3 Paquete `carrera-marco` (24-nov-2026)

Todo bajo `html.ph` (PQ / `RL` = rejilla con raíl, `NT` = secundarios sin cola, en `js/career-ui.js` junto a PQ/PS); PC sin cambios
(métricas de las ~110 `carrera-*` a 1280x720 idénticas a una pasada de la base con el mismo comando, y firma DOM/estilos de 14 hubs igual).
- **Marco**: raíl de 64 px y 5 apartados (`TABS_PH` sin Mensajes; ítems 44, icono 22, rótulo 12, gap `--ph-gap-min` 8: 5×44+4×8 = 252,
  cabe a 568x320 sin desplazar); fila de arriba de `--ph-bar`: pin «‹» 44 (aria «Volver al menú»), tira `#crSub` y, a la derecha, el sobre
  `.cr-mail` (44, `data-tab="inbox"`, contador en `.tb-b`; en Mensajes ningún apartado del raíl va marcado) y el sello de la media a 40.
  Título «JUGADOR / CLUB» fuera con raíl. Tira: brochazo de 40 (toque 44), activa centrada (`phStrip`), desvanecido 16 + chevrón 28
  (`.cr-ml` / `.cr-mr`). Rótulos cortos: Firma, Ropa, Jornadas, Ajustes (`SUB_PH`, `LIFE_PH`). Un punto rojo por nivel. `SP.phDedupe` en
  cada pintado de subpestaña (con el rótulo largo y luego el corto). «?» centrado con el sello (top −20, sin giro). `.cr-body` 10 arriba,
  14 entre tarjetas, desvanecido de 24 solo con `.sp-more`.
- **Dock** (`#crDock`): parche de `--ph-cta-h`, ancho según el texto (máx. 62vw), 1 línea; `phFitDock()` baja la letra hasta 15 px si no
  cabe; `small` debajo («Seguir» + club). Secundarios de 44 sin cola (parche plano del color `--sp-c`, lista `NT`). El dock es una fila de la
  rejilla (nada se desplaza debajo), así que el cuerpo no necesita el padding de `.ph-docked`.
- **Partido**: ticket compacto (`phKick`: «J5/14 · Sets a 21 · 8º · IA Fácil»; rival a 18 px; informe del rival como ficha de 44 dentro);
  avisos de career-story como pastillas de 44 con › (2 líneas como mucho a 844+); baja una vez (sin la pastilla «De baja» y sin «La juega…»;
  botón «✚ Baja»); «(½ XP)». `phDecide()` (antes de splatify): una decisión a la vez justo bajo el ticket (propuesta > selección > cesión);
  la propuesta lleva Rechazar + Aceptar al dock (2 viñetas, consecuencias en fichas verde/roja); la selección sin jornada del club, Simular +
  «Jugar · ESP contra ROU» al dock; selección/cesión durante la liga, franja `.ph-dec` de 56 px con su botón. Faro (`.cw-mentor`) en franja de
  56 px (cara 32, 1 línea, tocar = frase entera `.ph-open`, «Vale» como × de 44, botón extra debajo) y en cola con propuesta o gala
  (`phQueue`). Gala arriba en el fin de temporada; Estrellas (votación) tras el partido, «Pedir el voto · 2/3» de 48 con el coste en ficha y
  «Top 4» en la raya del corte; Plan del entrenador con rótulo corto en el dock.
- **Métricas** (ids del paquete, 3 tamaños): elipsis que cortan 0; toques < 44 0; solapes 0; toques juntos 146 → 145 (quedan los del sello
  girado junto al sobre y la pestaña elegida inclinada); < 14 px sube (rótulos del raíl a 12 y datos a `--ph-cap`, como pide §3.6).
- **Pendiente**: el raíl mide 252 de 252 a 568x320 (el brochazo sobresale 3 px: sin desvanecido); la franja `.ph-dec` corta con elipsis
  marcada (`data-ph-ell`) la línea de la selección a 568; fin de cesión y verano de selección salen con la gala de la muestra (Faro en cola);
  las tarjetas «Tu semana»/plan y el bloque de detalles `.cr-nd` no se tocaron; objetivo/entrenador del fin de temporada siguen en una línea.

### 7.5 Paquete `carrera-flujo` (24-nov-2026)

Todo bajo `html.ph` (PQ / PS de `js/career-ui.js` y `js/career-prologue.js`; bloque «— móvil (.ph) — «con aire» · paquete CARRERA-FLUJO» al
final del `<style>` de `index.html` para `#end`, `#gymEnd`, `#benchBar`, `#intro` y la hoja del informe). PC sin cambios: métricas de los 38 ids
a 1280x720 idénticas a una pasada de la base con el mismo comando, salvo la hoja del Partido de las Estrellas (un set en vez de dos, por el
arreglo de la muestra de abajo).
- **Crear jugador**: cabecera de una franja (‹ 44 · «Crea tu jugador» · Playa 2v2 | Pista 6v6 en píldora de 2 de 44, `phModeSeg`; fuera la
  tarjeta «Carrera»; la Carrera guardada, punto lima). Campos en tarjetas de 2 columnas (3 a .ph-w, padding 10, gap 8, rótulo inline de 12):
  Nombre | Dificultad (2×2, frase del nivel en 2 líneas) | Dorsal; Inicio a todo el ancho; Rol/Puesto a todo el ancho; Nombre y Dificultad a
  la vista a 568x320. Reglas de playa en 1 línea + «?» (`phRules`); explicación de Inicio tras «?». Pista: «País: España ▸» abre `SP.sheet`
  con continentes en pestañas y fichas de 44 (`phCountrySheet`, acción `cc-sheet`). Barra: «Crear jugador» (resto en small, `createTxt`) y a
  su izquierda «Falta: tu nombre» / «✓ Listo: …» (`phCreateCnt`, se actualiza al escribir).
- **Ofertas** (también rencor; `phFlow` antes de splatify): club en una línea de 44 (escudo 32, nombre, estrellas; liga y sede a la «i»),
  «1/4», cifras de 52, fichas Estilo · Compañero (pista: Tu sitio · Estilo; Rol y Puesto ya están en las cifras o son tuyos) y la «i» con
  todo lo de PC (hechos, rol, contrato en vigor, rencor, prueba). Rencor/cariño = ficha roja/verde con «?» en la línea del club (hoja con el
  motivo, `bondP` → `.off-bp`). «Duración» + años en una fila. «Pedir ser titular» ya era sp-md sin cola (carrera-marco).
- **Informe del rival**: hoja `.cr-ests` a pantalla completa (8 px), opaca, una sola ✕; Ellos/Saque/Tú encabezado de 12 encima; la ficha
  «Te tienen estudiado» en su línea.
- **Juvenil**: presentación con tu ficha en 1 línea (avatar 36) y el premio como ficha en la pregunta; «Ir directo a las pruebas» sube a la
  cabecera como botón fantasma (`.pro-skiph`, mismo doble toque). Temporada: «J3 · escudos 28 · A vs B» / «1 set a 15 · IA» / objetivos
  de 32 / entrenador en 1 línea; TUS PARTIDOS con encabezado inline (asoma a 568). Equipo: una lista con secciones de 12 y filas de 56
  (`details` con la bio; 2 columnas a .ph-w; `teamPh`). Chat: avatar 28, nombre en la línea, burbuja sin borde, seguidos sin repetir autor.
  Informe: banda círculo 52 + cifras, frase en 1 línea, «?» en la cabecera, INVITACIONES a la vista (filas de 44; `scoutPh`).
- **Prueba previa**: cabecera de 56 (escudo 36, nombre 22), objetivos en fichas de 40 de una línea (14 px, «≤ 2 errores»), «1 set a 15 ·
  con petos» + «i» (cómo es y qué nota hace falta), fuera la frase del cuerpo técnico; todo sin desplazar a 568x320.
- **Partido a medias**: «Seguir el partido» a la barra; «Se guarda cada punto.» a 12.
- **Hojas de partido** (`#end.crs`, la pone `ui.js endRecap` y main.js en las de extensión y prueba): antetítulo corto de una línea
  (`ui.js crKick` → `.ek-s`: «Regional · J3/14», «Continental · Clasif. 2º», «Continental · Grupo B · J2», «Prueba · Voley Valencia»,
  «Juvenil · J2», «Estrellas»), título clamp 22-28 en 2 líneas, «Menú» fantasma de 44. Panel: Progreso → premios → Tu partido → MVP (1 línea:
  nombre · 1.ª cifra · nota) → Clasificación (3 filas); fuera la frase del punto final. En .ph-s `ui.js endSplit` lleva el bloque secundario
  (objetivos de la prueba / juvenil, «Tu partido» con ▲▼ y la 1.ª ficha) a la columna izquierda bajo los sets (`.end-side`, área `lm`; vuelve a
  su sitio al cambiar de tamaño). Estrellas: recompensa primero, marcador del panel en 1 línea, «Tu nota · MVP» en una línea.
  Concurso (`#gymEnd`): recompensa en fichas bajo la cifra, top 3 + tu fila, «Siguiente» de 44 sin cola, «Volver» fantasma; sesión: igual
  (medallas en la fila de la nota, barra de 16). Banquillo: una barra de 44 [×3] [Saltar hasta entrar] [⏭ Final] y «En el banquillo» como
  ficha bajo el marcador. Previa de la Carrera: píldoras de 14, una por dato con flex-wrap; la del árbitro en corto («(amarilla en la J4)»).
- **Incoherencias (punto 7)**: las tres eran del **fixture** de depuración (`debug=over&cr=1&ext=…`: la cabecera salía del partido simulado,
  2-0 a 25), no del juego. Arreglado con `dbgSets` en los `_endDemo` (`career-prologue.js` 15-11, `career-allstar.js` 21-18,
  `career-natl.js` derrota 21-25 23-25) que `main.js` aplica a `g.sets`/`g.setScores` y al evento `gameOver` de la muestra.
- **Métricas** (38 ids × 3 tamaños): ver la pasada final; textos < 12: 0; toques < 44: 0; toques juntos 71 → ~30; recortes nuevos solo en
  fichas de una línea con su «i»/hoja (fichas de oferta largas, MVP).
- **Pendiente**: a 844 la ficha de Rol/Puesto de crear queda bajo el pliegue (se desplaza; el contador de la barra avisa); la hoja final
  a .ph-w no reparte columnas (solo .ph-s); la ✕ de la hoja del informe cuenta como solape con el sello de la media del hub (que queda debajo,
  tapado por la hoja opaca); TUS PARTIDOS asoma solo con el encabezado a 568x320; «Atrás» del juvenil (intro 2/3) sigue como mancha sp-md.

### 7.6 Paquete `carrera-jugador-club` (24-nov-2026)

Todo bajo `html.ph` (PQ de `js/career-ui.js`, bloque «paquete carrera-jugador-club» al final de `PH_CSS`; en las extensiones, tras `HLP.ph()`).
PC sin cambios: métricas de los 40 ids a 1280x720 (y 1024x768 / 1920x1080) idénticas a una pasada de la base con el mismo comando
(caracteres 81.720 → 81.720, toques, recortes y letra igual).
- **Atributos** (phys/def/atk): «Nv 2 · 92/152 XP · [4 puntos]» en una línea (sin nombre), barra de 5; `.attr` en rejilla «nombre · cifra / barra ·
  +1» de 52 de alto y 2 columnas también a 568; pie «Equilibrado · 60/100» + «?». **Decisión: no se funden** Físico/Defensa/Ataque: con 3-4 atributos
  por grupo caben en 2 filas sin desplazar a 568x320; fundidos serían 5 filas (10 atributos) y habría que bajar.
- **Firma** (saque de firma): `sigCard` en .ph = rejilla `.ph-grid2` (3 a .ph-w) de tarjetas de 64 sin cola (nombre a 16 + 1 dato: «Va en GOLPEAR»,
  «✓ …» la elegida, «🔒 Pide saque 62» a opacidad .7); tocar abre `sigSheet` (SP.sheet: descripción, a favor / en contra, botón, lo que pide)
  con «Elegir» de 48 abajo a la derecha (no sale si está bloqueado o ya es el tuyo; acción `sigsh-<id>`). Intro tras «?». Gesto en línea con
  `.seg` de 44 y gap 8: a 844 se ve sin desplazar. El fallo del texto fuera del brochazo (`.cr-sig-l>.sp-btn.sp-wrap`) desaparece en el móvil
  porque ya no se pinta esa lista; **existe también en PC** (1280x720: «GLOBO» y «Va en…» rozan / salen del brochazo): anotado, sin tocar.
  Insignias: rejilla de 2 (3 a .ph-w) de 64, bloqueadas a .7; el «?» del sello deja 28 px a la primera fila.
- **Estado**: «Plan del entrenador» = tarjeta con el enfoque en una línea, «Plan ›» sp-sm en la fila y la explicación tras «?»: ya no va nada
  a la barra de abajo (en Estado con baja, la barra se oculta y «Volver antes» / «Fisio intensivo» se ven en la tarjeta, 48 de alto).
  Lesión (`career-injury.js`): el muñeco de 40 dentro del sello, «Vuelves en 3 partidos» + barra + «1/4» en una fila, rehabilitación tras «?».
  «Lesiones Sí/No» sale en Vida › Ajustes (`U.opts`, solo .ph) y no en Estado; en PC sigue en Estado.
- **Ropa**: una fila (colores del club · «67/155 · 2 nuevos» + peinado · «?» · parche «Vestuario ›» de 48).
- **Club › Ficha** (playa y pista): `phClubHead` (escudo 56, `shortClub` a 20, patrocinador · estrellas · liga a --ph-cap, «?» en la fila con lo
  largo) y `.ph-kv` (2 col a 568, 3 a .ph-w) con Objetivo (a todo el ancho, 2 líneas si hace falta) y Posición / Tu puesto primero, colores como 3
  puntos; entrenador en una línea con su barra. Helpers `kv()`, `clubParts()`, `coachKv()`; `HLP.shortClub`.
- **Equipo** (pista): filas de 44 de una línea (nombre · n.º · media · punto de forma · T/S/F), puestos como cabecera pegada arriba (28),
  «Tu puesto: 2º de 4 receptores» en pastilla dorada con el «?» de la leyenda; tu fila con el color del club.
- **Compañero**: sin sello; retrato 48, fichas en una fila (se deslizan), «Química · Conocidos · 9/100» + barra de 8 a la vista y los párrafos
  tras «?». Plantilla: la explicación tras «?».
- **Contrato**: sin sello; `.ph-kv` (Rol · Quedan · Sueldo / Ahorros · Firmado) y el rol en una línea con «?». La respuesta del club (renovar / no,
  `career-loan.js uiAsk`) sube arriba del todo: renovación en `.ph-strip` (Rol ▲ en verde, años, sueldo +250 €), «Prefiero salir» / «Insistir»
  neutros (crema) en la barra; el «no» en una franja con la consecuencia en pequeño. Cedido: sello «Cedido», nombre + «Hasta el final · vuelves a…»
  en una línea, 4 cifras en `.ph-strip`, lo demás tras «?».
- **Ofertas / cesiones**: vacío en una línea + «?»; cesiones con el bloqueo arriba («Estás de baja» en rojo), condiciones en una tira de fichas,
  ofertas de una fila (escudo 40 · nombre · «liga · media · sueldo» · «Ir cedido» de 48 a la derecha) y «No, gracias» de ancho automático.
- **Gente**: `details` de 56-72 (nombre + papel, cifra grande a 26 con «+4 ▲», barra de 6); la frase y el último cambio al tocar; 2 col a .ph-w.
- **Liga › Clubes › ficha / rencor** (`career-world-ui.js`): «‹» de 44, escudo 56, nombre corto, «liga · año · apodo» en una línea, «1r · 9 pts»
  a la derecha de la cabecera (fuera la tarjeta «Esta temporada» salvo la forma), rencor / cariño como franja de una línea bajo el nombre (a la
  vista a 568x320), fichas en una fila.
- **Selección** (`career-natl.js`): franja de 44 (bandera 28 · ESPAÑA · Titular · Confianza 56 · «?» con seleccionador y química), el partido en
  grande primero («Grupo B, 2ª jornada» / «ESP contra ROU» a 24), tabla con filas de 36 y el torneo como pie de 13; clasificación con su tabla
  «Partido / Resultado» en vez de las líneas sueltas; sello «Clasif.».
- **Plan y pedir puesto** (`career-dev.js`): cabecera de una fila (sello corto «Plan · Sin plan», «?», × de 44 sin mancha); filas de 52 con gap 10,
  atributos abreviados sin elipsis («Rec 42 · Def 39»), «Recomendado» como ★; **tocar elige** (marco dorado + ✓, `pick`) y la barra lleva
  «Confirmar plan» / «Pedir Opuesto» solo con algo elegido (`dv-plan-go` / `dv-ask-go`; en PC el toque sigue aplicando al momento). Pedir puesto:
  «Ahora: Receptor · encaje 86 %» y una barrita de encaje por fila; la dificultad, solo si cambia entre filas (si no, una línea debajo).
- **Métricas** (40 ids × 3 tamaños, contra la base del mismo comando): < 12 px 0 → 0; toques < 44 0 → 0; toques juntos 343 → 293; caracteres
  39.129 → 30.024; recortes 2 → 17 (todos en líneas de una línea con su «?»: rol del contrato, meta de las cesiones, «vuelves a…» del cedido,
  patrocinador largo); solapes 0 → 0 (los del «?» de Insignias, corregidos). Prueba de interacción (hoja del saque + Elegir, plan elegir →
  confirmar, Lesiones en Ajustes, «Plan ›» fuera de la barra): `scratchpad/cjc/inter.js`, todo OK a 844x390.
- **Pendiente**: a .ph-w la lista de pedir puesto va a una columna (cabría en 2); la tabla del grupo de la selección asoma bajo el partido a
  568x320 (hay que bajar para verla entera); cesiones: con nombres muy largos el dato de pareja/puesto cae tras la elipsis de la línea de meta;
  el Faro/ayudas del Estado (career-story «ánimo y forma») no se tocaron; Insignias sigue con la descripción entera en la tarjeta (sin hoja).

### 7.7 Paquete `carrera-liga-vida` (24-nov-2026)

Todo bajo `html.ph` (PQ / `PX` = un id más para ganar a career-story-msgs / `LV(cv)` = `#crBody[data-cv="…"]` en `js/career-ui.js`, bloque
«paquete carrera-liga-vida» al final de `PH_CSS`; en las extensiones, tras `H.ph()` / `qph()`). PC sin cambios: métricas de los 40 ids a
1280x720 (y 1024x768 / 1920x1080) idénticas a una pasada de la base (`VB_ROOT=<worktree de HEAD>`, mismo comando): caracteres 81.379 → 81.379.
- **Mensajes**: fuera la cabecera verde (`.st-ctop`); lo que espera respuesta como insignia de «Bandeja» (`subBadge`, `#crSub .tb-b`, roja);
  conversaciones como filas crema de 56 separadas 4 (avatar 38, nombre `--ph-row`, avance de 1 línea `--ph-body`, «T1 J4» `--ph-micro`) y
  sin desplazamiento propio: 4 a la vista a 568x320. **Redes** (`.st-wph`): sin sello, «Publica algo…» a 13, los 3 tonos en una fila de
  3 de 64-72 sin cola (efectos ▲▼; «Pique con tu rival» → «Pique» solo en el móvil), el muro asoma debajo.
- **Clasificación**: filas de 44 (36 en .ph-s → 6 filas a 568x320) sin caja por fila (rayado), tu fila con tu color y raya de tinta, zonas
  como línea de 4, cabecera pegada a `top:-10px` opaca, `scroll-padding-top` 40; a 568 # Club PJ G P Pts (ya lo hacía `hide-s`).
  **Jornadas**: filas de 40 gap 4 centradas, fuera «Pendiente», desvanecido arriba (`.sp-less`). **Copas** (antes de jugarse): una fila
  de 48 por copa (trofeo 24 · nombre + quién entra · «✓ Dentro · 3r» / «Fuera · 8º» / «Solo 1ª»). **Noticias** (`career-world-ui`): sin sello
  ni nota; «T1 J4» en columna de 32, titular de 2 líneas, gap 10, leídas en tinta y nuevas en crema con su punto. **Clubes**: «Liga · 12»
  dentro del selector, filas de 48 en una línea (escudo 28 · `shortClub` · «1r · 62» · ›; tu club / tu rival con su raya; estrellas, en la ficha).
- **Premios** (`career-race.js`): fuera la tarjeta-sello; el segmentado es una fila pegada arriba (44, fondo de tinta) con el «?» al final
  (que lleva también la jornada); fuera el sello «MVP» (va en la línea de unidad); filas de 48 opacas en una línea (puesto 32 · flecha de
  color ▲▼= · nombre 16 · club 13 con elipsis · nota); tu fila «Tú, fuera del top 2» pegada abajo (`sticky; bottom:0`) si queda fuera.
  Sin «·» en sus textos (racetest lo prohíbe).
- **Vitrina** (Palmarés, selección, Estrellas): `phAncBar` = «0 de 20 títulos» como ficha + «Temporadas ↓» (`data-act="anc"`); en
  `trophyCaseHTML` (.ph) un bloque por categoría con rótulo pegado arriba «Liga 0/2»; las categorías sin nada, en una línea (rótulo + huecos
  de 44 sin nombre, al 55 %; a .ph-w de dos en dos); las que tienen algo, rejilla de 5 (≥ 96 px a .ph-w ≈ 7), icono 48 (40 en .ph-s), nombre
  corto de 2 líneas (`tcShort`: «Ascenso al …» → «↑ …»; el entero en la hoja), vacíos al 40 % sin círculo discontinuo. Selección: una línea
  con «Ver selección» de 44.
- **Anclas**: la fusión de móvil se queda; Temporadas va en `#crAnSeasons` y Legado en `#crAnLegacy` (con su sello pegado arriba). Al abrir
  `honors/seasons` o `life/legacy` career-ui baja sola al ancla (`phAfter` + `phReveal`, que corre tras el `scrollTop = 0` de setTab), así que
  las filas de mobaudit ya capturan el ancla (comentario actualizado). «Legado ↓» está en la fila de Fama.
- **Cifras** (`career-story-season`): primero la tira de 4 cifras de la carrera (solo si hay partidos de carrera), luego «Por temporada» con
  «Ver tabla completa» de 44 sin cola junto al encabezado y PG/PJ tras «?»; el club con `shortClub`. **Ajustes**: una tarjeta `.cr-opts` con
  filas de 52 (`.cr-orow`: rótulo · `.seg` de 44 gap 8 · «?» · la frase en una línea) para Dificultad, Cuánta vida (`career-story-ui`) y
  Lesiones (`career-injury`, que ya solo salía en el móvil); el resto (Puesto, Carrera, Opciones) debajo como antes.
- **Vida**: Fama (`lf-fph`) = «113 seguidores · Desconocido» + «Legado ↓» + «?» en una fila, barra de 8 con «→ Promesa local, faltan 387» y
  una línea de rachas (~120 px; Celebración a la vista, su explicación tras «?»). Tienda (`lf-sph`): «Material · Ahorros 1.000 € · ?», filas
  de 54 con «Nv 0/3» y el precio en un botón de 44 sin cola (al 75 % si no llega, y «faltan 500 €» en la línea). Logros (`lf-gph`): tarjetas
  de 3 líneas en 2 columnas (3 a .ph-w), barra de 6 + «1/5 · +1 punto de mejora», «?» con la intro, «2/31» como insignia de la pestaña, los
  conseguidos en «Conseguidos (N)» plegado. Camino (`ss-pph`): «Nivel 0/20 · ★ 2/60 · falta 1» + barra de 8 y la tira horizontal de niveles
  (premios 60 px, sin premio puntos de 20, el siguiente con aro dorado; `[data-ph-center]` centra el actual).
- **Estrellas, fin de semana** (`career-allstar`): cada concurso en una fila (nombre + estado · marca a 13 · podio en 3 fichas de 14) con
  «2º intento» / «Ver los 6» / «Ver resultado» de 44 sin cola a la derecha: 2 concursos a la vista a 568x320.
- **Métricas** (40 ids × 3 tamaños, contra la base de este paquete): < 12 px 0 → 0; solapes 8 → 0; toques juntos 306 → 283; toques < 44
  0 → 13 (los nombres de club de la tabla a 568x320, filas de 36 que pide la tabla de consulta); tapados 4 → 5 (filas bajo la cabecera pegada
  de la tabla); recortes 6 → 21 (líneas de una línea con «…»: club del ranking, avance de mensajes, marca de concursos, descripciones de la Tienda).
- **Pendiente**: el Legado sigue como tarjetas de PC (solo lleva su sello pegado); la tira de 4 cifras de Cifras no sale hasta que hay partidos
  en `c.career` (la muestra de mobaudit no los tiene en pista); la Vitrina con títulos ganados se probó con un guion aparte (3 trofeos de
  playa: rejilla de 5, «×2», nombre corto), no hay fila de mobaudit para eso; las copas ya en juego (`c.kos`) siguen como tarjetas; la tabla a 568 deja el nombre del club como toque de 36.

### 7.8 Paquete `paneles` (24-nov-2026)

Todo bajo `html.ph`: CSS en el bloque «— «con aire» · PANELES» al final del `<style>` de `index.html` (antes de `</style>`); JS en `ui.js`
(`PH_BAR` con set y ctl, `phNow`, `pfGroup`, `rtTxtPh`, `LK_LABEL_PH`, `semVw`), `input.js` (editor), `semana-ui.js` (`tabHTML(mode, vw)`) y
`account.js` (reglas PP del final de su CSS y `phHTML`). `.ph-bar` estático en las cabeceras de `#mpRetos`, `#mpLook` y `#mpProf`.
PC sin cambios: métricas de los 36 ids a 1280x720 / 1920x1080 / 1024x768 iguales a una pasada de la base con el mismo comando
(`VB_ROOT=<worktree de la base>`), salvo selectores con clase nueva (`b.ph-no` del sello de Hoy, `.sem-vwh`) y 5 caracteres de más en
controles-keyboard que vienen de la escena 3D de fondo (el panel se ve igual a ojo).
- **Ajustes** (y la pausa, mismo panel): franja ‹ sin título; el raíl de 7 pestañas empieza arriba a la izquierda del ‹ (44 de alto, 8 de
  hueco). **A .ph-s el raíl no cabe en columna** (7×44+6×8 > 304): las pestañas van como iconos de 44 en la propia franja, junto al ‹ (la
  elegida con su rótulo) y el panel gana todo el ancho. Filas de 52 con 8 de hueco, título que nunca parte (`contain:inline-size` en la
  ayuda), ayuda en UNA línea con «i» (`helpFit`); títulos cortos con `data-ph-short` (Cámara 6v6, Ambiente, Diana en el salto, Daltonismo,
  Marca contrastada; Zoom «De 1 (cerca) a 5 (lejos)»); Calidad/Resolución «AUTO·media» / «AUTO·100 %» en el selector (`phNow`, `data-now`);
  selector compacto (flechas 44, valor 64-170); sin chevrón sobre la última fila. Equipación: muestras que parten de línea; a .ph-w rótulo
  y muestras en la misma fila (contenido intacto). Info: filas que abren algo arriba, Versión/Progreso en líneas de 32 al final.
  La vista previa de Accesibilidad sigue «si cabe» aunque la ayuda lleve «i» (previa en la 2.ª columna, «i» en la 3.ª).
- **Controles**: franja ‹ + pestañas (sin CONTROLES); Teclado y Mando en 2 columnas también a 568 (filas de 48, teclas de 40 con toque de
  44); Táctil con filas de 52, 2 columnas de acciones a ≥ 740 y «Editar disposición» como fila naranja de 48 (texto solo en el móvil;
  touchedittest acepta «disposición» en minúscula). Títulos-frase de Táctil («Al colocar: …») parten en título + ayuda.
- **Editor táctil**: una barra de 52 arriba centrada en el hueco entre el borde y la lupa/pausa: [nombre] [Tamaño] [Opacidad] [⇄ 44]
  [↺ 44] [✓ Listo] (iconos con aria-label; reglas de 44 de toque); con zurdos se arrima a la derecha; «Arrastra los botones…» en una
  pastilla debajo solo hasta el primer arrastre (en el móvil); a < 640 de ancho el nombre va en esa pastilla. La subida/bajada de la barra
  (`.low`) cuenta ahora lo que ocupa la fila de verdad (no la caja ancha).
- **Vestuario**: cabecera de una fila en todos los tamaños (‹ · pieza · 1 2 · PISTA PLAYA; la pieza fuera a < 640), jugador/sede de 44
  con 8, 7 pestañas de 44 con 6, filas de una línea «Etiqueta · Valor» (13/15) sin «▦ N», flechas de 44, valor con «…», rótulos cortos en
  el móvil (Color, 2º color, Efecto, Manguito izq.…); columna minmax(320px, 46vw); «Pinta: Calcetines» fuera cuando repite. A 568x320:
  filas de 48 con 4 de hueco (3,5 filas a la vista con la tira de pestañas encima). Muñeco y botones laterales intactos.
- **Perfil**: raíl desde arriba con pestañas de una línea y el contador como chip (44, hueco 8; se desplaza a 568/844), franja de 44 con
  ‹ · nivel y XP · los 3 huecos de la vitrina; rejilla de 4 (6 a .ph-w) de baldosas de 72-80 (nombre en 2 líneas); Insignias y Entreno:
  una baldosa por prueba con 3 puntos bronce/plata/oro (`pfGroup`, solo móvil); punto de novedad dentro; «Elige un hueco…» como texto
  vacío (`.pf-empty`); la baldosa descrita marcada (`.pf-cur`); avisos arriba en el centro; Cuaderno con una regla elegida: el detalle en
  una columna derecha del 40 % (rejilla de 3/4).
- **Retos**: franja ‹ + 3 pestañas; Hoy con sede en una línea, pastillas en tira, la fecha dentro del sello (ph-only) y ¡A JUGAR! en la
  columna derecha bajo las medallas a .ph-s / bajo la tarjeta a ≥ 740 (sin sticky); columna de 820 como máximo. Maestría: filas de 52,
  «récord 0 · bronce 2» (`rtTxtPh`), 2 columnas a ≥ 740. Semana: mapa entero (min(100%, 46vh)); con grupo, segmento «Mapa | Grupo (N)»
  de 44 que enseña una cosa a toda la altura (`data-semvw`).
- **Cuenta**: al escribir se van pestañas/Google/«o con tu correo»; campos de 44 con texto de ejemplo; correo y contraseña lado a lado en
  todos los móviles; #btnVer oculto con la cuenta abierta; con sesión, «Sincronizar» = círculo de 44 dentro de tu tarjeta junto al estado y
  «Cerrar sesión» debajo; «Borrar la cuenta» abajo de la columna derecha; el aviso de borrar a todo el ancho.
- **Métricas** (36 ids × 568/844/915, frente a la base del paquete): < 12 px 0 → 0; toques < 44 63 → **0**; solapes 81 → 48; tapados 51 → 40;
  con scroll 138 → 88; toques juntos 375 → 499 (pestañas y fichas a 8 justos que mobaudit mide con el adorno; editor junto a la lupa);
  recortes 10 → 56 (todas líneas de una línea con «…» y su «i»: ayudas de Ajustes, valores largos del Vestuario, rótulos de Perfil).
  Pruebas: csscheck, settest, touchtest, touchedittest, keytest, padtest, a11ymarktest, looktest, proftest, retotest, semanatest,
  synctest, googletest, kittest, abouttest, badgetest, gymtest, consignatest, ambientetest: todas OK.
- **Pendiente**: el raíl de Perfil se desplaza (8×44 no cabe a 320-412 con 8 de hueco); en Vestuario a 568 los valores largos con muestra
  («Sin segundo…») se cortan; nombres de una palabra larga en Perfil («Rompemano») se cortan sin «…»; a 844 el ‹ de Ajustes queda solo en
  su franja (sin título por especificación); el editor no se probó con el 6v6 (botón Pedir) ni en vertical; «Mapa del grupo» sin segmento
  cuando no hay lista; la tira de pestañas del Vestuario (7×44+6×6) sobresale 28 px de la columna a 568 (no toca el muñeco).
