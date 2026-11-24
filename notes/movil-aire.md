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

### 7.4 Paquete `menus` (24-nov-2026)

Todo bajo `html.ph` (vertical: `html.pv`); CSS nuevo en el bloque «— móvil (.ph) — «con aire» · paquete MENÚS» al final del `<style>` de
`index.html` (antes de `</style>`), y lo del online en `js/netlobby.js` (CSS `PP`/`PW`) e Instalar en `js/install.js`. PC sin cambios: las
métricas de los 38 ids a 1280x720 son idénticas a una pasada de la base con el mismo comando (`--desktop --sizes 1280x720`).
- **Portada**: sello semanal = `.ph-sticker` en la esquina de JUGAR (`menu-jugador.js`: `#btnMjReto.ph-sticker`, `.mj-go.ph-stk-host`) y vuelve
  la línea pequeña de JUGAR («Rápido, 6 contra 6 y entreno» con `data-ph-short`); en el móvil `ui.js syncHero` la enseña cuando JUGAR es lo
  primero y la quita con billete encima (al revés que en PC). `.sp-t` de JUGAR lh 1.1 + 2 px. Billetes (¡Jugar ya!, Seguir, Carrera) de 56 y
  JUGAR de 52 debajo; antetítulo «PRIMERA VEZ / PARTIDO A MEDIAS» como pastilla de tinta en el canto. Carrera: un escudo de 40, título en una
  línea con «…», «T1 J5 · Continuar» (`menu-jugador.js ticket`, corto en .ph). Fuera las pastillas «Nv» de Jugadores. Ayuda a 844+ con 18 px de
  hueco; a 568 rótulos sin espaciado (máx. 30vw). Perfil = círculo de 48 con el contador del álbum en insignia (`.pf-n.ph-only`).
- **Jugar**: cabecera solo con ‹ de 44 (sin la palabra), Retos = `.ph-sticker` en la esquina del parche, Carrera en una línea («Playa o pista:
  crea tu jugador», `career-ui.js syncMenu0` en .ph), 12 entre filas, manchas de 88 (80 en .ph-s) con icono 40.
- **Partido rápido**: Escenario deja la columna del «?» (valores alineados), flechas del final al 35 % sin contorno, `span.arr:empty` sin
  eventos, 12 bajo la cabecera; a `.ph-w` ¡A JUGAR! en columna derecha de 230 a media altura.
- **Entrenamiento**: `.mp-head.ph-bar` (también Jugar), rejilla de 2 (3 a .ph-w) de tarjetas de 52 (medalla 32, nombre + 1 línea, un solo estado:
  «Nuevo» o «Récord N»); PELOTEO LIBRE = primera tarjeta (parche), ya no flota encima de la lista.
- **Paneles** (`ui.js PH_BAR`: tut, first, squad, about, fb → `.pn-head.ph-bar`): ‹ de 44 sin bocadillo; título a `--ph-head`.
  - Cómo se juega: «Paso N/6» en la franja (`#pnPh`), `TUT_PH` = 2-3 viñetas por paso (≤ 90 car.) y «Más detalle ⓘ» (`#btnTutMore`, en el
    pie junto a ‹) abre `SP.sheet` con el texto y la regla de PC (`tutMore`); dibujo `min(28%,150px)`; pie ‹ 48 · puntos · SIGUIENTE de
    `--ph-cta-h`; paso 6 en rejilla de 2 (3 a .ph-w) sobre tinta al 96 %. Se repinta con `vb:ph`.
  - Jugadores: N.º1/N.º2 como dos fichas de 44 en la franja + «Aspecto» como icono 44 a la derecha; fila de atributo de 48 en una línea
    (nombre · barra · número · +1 de 44), la descripción al tocar la fila (`aria-expanded`, `ui.js`); fuera el «1» suelto.
  - Acerca de: pestañas en la franja, sin título ni ENTENDIDO, un solo marco; Créditos en filas clave/valor (`#abBody.ab-cr`).
  - Opiniones: pestañas Sugerencia/Bug en la franja; rejilla «cuadro | 140 px» con ENVIAR abajo a la derecha, sin CANCELAR; «Se adjunta…» tras
    la «i» (`.fb-attq.ph-only`, hoja con `#fbAtt`); contador solo desde 1800 (`.fb-n.near`); con teclado se esconden también las pestañas.
  - Primer partido: sin la ficha «6 pasos»; JUGAR YA a la izquierda de VER CÓMO SE JUEGA en una fila.
- **Aviso del colocador**: 2 frases + «Más» (`.sn-sh` / `.sn-lg`, `#setNote.sn-x`); ACTIVAR abajo, «Ahora no» encima, «No mostrar más» como enlace.
- **Instalar**: capa al 70 %, número del paso en línea (32), dibujo de 80, SIGUIENTE de 48 dentro de la hoja.
- **Online**: lista en rejilla «salas | 150 px» también a 568 (CÓDIGO / CREAR SALA a la derecha); sala de 56 en una fila (sede 36 · nombre ·
  «Platja Llarga · 1 set a 21» · ENTRAR), sin «VS ?»; las no disponibles en tinta al 55 %; «Juegas como» = ficha de 44 con el nombre y el lápiz.
  Aviso en la columna derecha encima de los botones. Crear sala: rejilla de 2 de selectores (rótulo encima, ‹ valor › debajo; 72 / 58 en .ph-s),
  vista previa solo a .ph-w (260). Cómo funciona a 2 columnas a .ph-w. noacc/off/nortc: el botón dentro de la hoja; nortc con «Copiar enlace»
  (`copyLink`). Sala: reglas en una fila.
- **Vertical** (`html.pv`): los dos sellos con `.ph-sticker` (Retos encima del parche, sin tapar el título) y «Volver» de Jugar fijo abajo a la
  izquierda (48) con hueco bajo las manchas.
- **Métricas** (38 ids × 3 tamaños, contra la base del mismo comando): textos < 12: 0 → 0; solapes 10 → 3 (los 3 de Instalar son la ✕ sobre
  el canto, igual que antes); caracteres 26.284 → 22.471; contenedores con scroll 48 → 19; recortes con elipsis nuevos solo en descripciones
  de una línea (Entrenamiento, sede larga de la sala). Toques < 44 0, salvo «Más» del aviso (área de 44 tras el ajuste).
- **Pendiente**: online-room sigue con «Salir de la sala» + «Compartir» (no se quitó la salida: la ‹ de la cabecera no sale de la sala);
  Partido rápido a 568 sin cambio de columna para la CTA (cabe con el parche abajo); el contacto plegado de Bug no se hizo (el formulario no
  tiene campo de contacto); Instalar no se probó en vertical; las descripciones de las salas con sede larga cortan con «…» (está la ficha
  de la sala al entrar).

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

### 7.9 Paquete `partido` (24-nov-2026)

Todo bajo `html.ph`: CSS en el bloque «— «con aire» · PARTIDO» al final del `<style>` de `index.html` (tras PANELES); JS en `ui.js` (`phHud`,
`phStrip`, `endTools`, `senaShow` en .ph, `rcDayHTML` / `rcHTML` / `renderPause` / `renderSubs` / `placeMStats` / `msRender` con su rama de
móvil) y `matchstats.js` (índice `.ms-idx` ph-only y `.ms-long` en el 6v6). PC sin cambios: métricas de los 35 ids a 1280x720 idénticas a una
pasada de la base de este paquete con el mismo comando (`--desktop --sizes 1280x720`, 0 pantallas con diferencias) y capturas iguales a ojo.
- **Rótulos del HUD** (un solo rótulo grande arriba a la vez): la seña ya no cuelga a la derecha de `#pbug`: en el móvil `senaShow` la pega en
  `.sb-bw` y el CSS la pone bajo el marcador en la columna izquierda (56 px reales, palabra con tinta de 3; sale/se aparta con la pestaña por
  `:has(#pbug.show.sn-on|.out|.held)`); «⇄ Saque» es la 2.ª línea pequeña dentro de la pestaña; con seña o cinta se ocultan «● Punto de set» y
  JUGADA. «Espera el silbato» y el aviso del saque van a la franja de abajo (`phStrip`: busca de abajo arriba el hueco entre joystick y botones
  con `touchBoxes()`, `#prompt.phb`), en UNA línea «SACAR flotante · SALTAR potente» (firma: «SACAR De abajo»…). Con la cinta (`#banner.show`)
  se aparta la tira de fases. Zona: llama en vez de «ZONA», «RACHA» = llama de 12. Métrica `rot`: 22 → **0** en los 3 tamaños.
- **HUD pequeño**: marcador al 85 % en `.ph-s` (`--sbs:.663`, letra compensada, misma forma); lupa a 12 de la pausa con el número dentro; ⇄ / mano
  de pedir de 56, opacidad ≥ .6 (también bloqueado) y 24 px sobre GOLPEAR; consejo de una línea pegado a la tira de fases (top 46); CAMBIO como
  pastilla de 36 bajo el marcador en `.ph-s` (en una fila «CAMBIO ▲8 ▼4 Cambios: 1/6»).
- **Frenar / protestar**: durante la decisión, fuera seña, «⇄ Saque», subtítulo de la pestaña y JUGADA; bloque abajo entre los pulgares (pregunta
  16, botones 160×52 —150 a 568— con 16 de hueco, barra de 6).
- **Pausa**: «Pausa» + marcador a su medida arriba; a la izquierda Reiniciar y Salir en tinta con borde verde / rojo y «Opinar» (Sugerencia+Bug en
  un botón que abre el panel con las dos pestañas; el aviso de la semana va en su sitio como texto con ⚠ sin caja); a la derecha Controles | Ajustes
  sobre SEGUIR JUGANDO; huecos de 12 (8 a 568). Paneles desde la pausa (`.sheet.ph-pz`): Ajustes con Audio, Cámara, Juego y Accesibilidad; Controles
  en táctil solo con Táctil y «Otros mandos ›» al final (`.ph-allc`). pausa-bug ya salía como Opiniones de `menus`; pausa-ajustes como `paneles`.
- **Cambios 6v6**: pista en rejilla 3×2 (4-3-2 / 5-6-1, `data-z`) de fichas 76×56 (52 a 568) con número, puesto y la energía como borde de 4;
  banquillo en una tira; sin desplazar; ayuda corta a la derecha de la cabecera («6/6 cambios · toca quién sale → quién entra»); con alguien
  elegido, los no compatibles a .35 con el puesto tachado y los válidos con borde verde.
- **Hoja final** (`endTools` → `.end-tl`, área «tl»): «Ver celebración» (solo el ojo a 568) y «Cambiar opciones» («Opciones» a 568) en la columna
  izquierda en las 3 pestañas; la situación lleva ahí «Enviar» y «Grupo»; abajo «Más difícil · Menú · Revancha» con «Más difícil» en tinta y
  borde verde. MVP en fichas 2×2 sin «|». Primer partido: «Y ahora» en la columna izquierda a 844+ (a 568 no cabe: sube al principio del Resumen,
  fichas de 44), «Más difícil» oculto y «Opciones» junto a «Menú». Cifras: Puntos primero, MVP de 40, «Ver todo ›» al pie. Jugadas: la fila entera
  es el botón (▶ 40 + «Bloqueo del n.º 1 · 2º set | 9-6»), 48 de alto. Reto: medallas en una fila, «¡Oro! +115 XP», sin MVP ni frase, sin «(a cada
  jugador)». Entreno: sin «Oro: 24 puntos» (`.ge-nx`), Siguiente / Entrenamiento oscuros de 48. Situación: título sin el resultado, sin MVP.
- **Estadística**: título «Estadística» y ‹ de 44 en la franja; equipos + sets en una fila pegada arriba (sets que se deslizan, 44); índice de
  secciones en fichas (Cifras · Marcha · Jugadores · Rotaciones · Mapas · Errores) que baja a cada una; las 6 cifras en rejilla 3×2 de 64 sin
  marco; en el 6v6 Rotaciones, Mapas, Errores y Por jugador plegadas (se abren con su título o su ficha).
- **Previa / repetición**: kicker, «Toca para empezar» y subtítulo de la repetición a 14, tira de datos 8 más abajo.
- **Métricas** (35 ids × 568/844/915 frente a la base del paquete): < 12 px 0 → 0; toques < 44 0 → 0; solapes 0 → 0; `rot` 22 → 0;
  contenedores que piden desplazar 34 → 17 (Cambios 6 → 0); caracteres en las hojas y la pausa −10 a −60 %. Contra «antes» (mobcompare):
  < 14 px 591 → 487, toques < 44 1 → 0, toques juntos 89 → 81, con scroll 46 → 25, caracteres 11.339 → 10.400 (el recorte que queda es la
  ayuda de una fila de Controles a 844, de `paneles`, con su «i»). Pruebas: csscheck, settest, touchtest, touchedittest, keytest, padtest,
  a11ymarktest, abouttest, jugaryatest, retotest, replaytest, statstest, recaptest, semanatest, ambientetest, gymtest, senatest, subtest,
  zonetest: OK; feedbacktest OK salvo la comprobación del orden de los `<script>`, que falla igual sin este paquete (la copia de trabajo de
  index.html tiene CRLF y la expresión busca un salto de línea sin CR); se actualizaron sus comprobaciones de móvil («Opinar» en vez de Sugerencia + Bug, sin Cancelar).
- **Pendiente**: el MVP de Cifras sigue con su tabla de PC encogida (en 568 asoma el 2.º); la Estadística del 6v6 a 568 sigue desplazándose
  (es una tabla larga, ahora plegada); «Y ahora» a 568 queda dentro de la hoja derecha y no en la columna (no cabe con los sets); el aviso del saque
  en la franja se probó con la disposición de fábrica y zurdos (con botones movidos a mano usa los mismos `touchBoxes`, sin prueba propia);
  la cinta de punto de set sobre la seña sigue la regla de PC (la cinta va arriba y la pegatina colgando de ella).

---------------------------------------------------------------------------------------------------------------------------------

## 8. Ronda 2 (24-nov-2026): sin recortes y bien en vertical

Lo que dijo Ferran tras la ronda 1: «Se tienen que ver bien tanto en vertical como en horizontal». Base de la ronda: pasadas de `mobaudit` en
`C:/Users/Puru/AppData/Local/Temp/claude/256b3765683db9c6/7d7e82ec-6440-4b76-aa17-571f5ef4d6f9/scratchpad/movil2/` — `pcbase` (rama feedback
f7945e7, antes del rediseño), `pc0` (movil-aire 4d8fd7f), `h0` (horizontal 568x320 / 844x390 / 915x412, DPR 2), `v0` (vertical 360x740 / 390x844 /
412x915, DPR 2; la Carrera se pasó en `v0c` y se fusionó). 7 revisiones UX por zona (notas H y V por pantalla) y un informe de marketing vertical.
**Orden de objetivos**: (1) nada importante cortado; (2) vertical bien en todo lo que no es el partido en juego; (3) horizontal igual o mejor;
(4) PC EXACTAMENTE igual que `pcbase` (todo selector nuevo bajo `html.ph` o `html.pv`; todo JS de disposición tras `SP.phone()` / `SP.pv()`).

### 8.1 Diagnóstico

**Recortes.** La ronda 1 ganó aire recortando: de 94 recortes «antes» a 209 tras los paquetes en horizontal (88 en `h0` tras la ronda final,
en 63 filas pantalla×tamaño). Cinco clases:
1. *Descripción de una línea con clamp + ⓘ* (Ajustes «En la Carrera, el entrenador te pide cos…», Controles «En el aire: toca Golpear pronto y
   desliz…», contrato «Rotación: Juegas cuando… Con 7…», vitrina «Final a Cuatro…»): se corta justo el dato.
2. *Rótulo compuesto que comparte fila con un botón* («SELECCIÓN: EUROPEO VEC DE PL…», «Grupo B, 2ª jornada, ESP contra RO…» junto a «Ver torneo»;
   «Circuito Regional, Media 35, 500 €/mes P…» junto a «Ir cedido»; «Clasificación, 1r partido, ESP contra SR…»).
3. *Texto de mensaje o aviso cortado* (vistas previas de la Bandeja; mentor «Hugo Dubois va diciendo que es mejor que…»; «Una temporada corta con tu ins…»).
4. *Fichas que no caben* (MVP «Ares Belmo…» / «2…» en el resumen de jornada; «Incombustibl»; «Director de orquesta (pista)»; «Jugador 1120» en Crear sala).
5. *Invisibles para las métricas*: lo tapado por el degradado del pie (MVP de la hoja final a 844, «2 aces» en vertical, consecuencias de la
   propuesta de puesto a 568, tabla del grupo de la selección a 568), filas de chips con `overflow:hidden` («Caducan al j»), tablas que se salen
   (columna Nota de Estadísticas de la Carrera) y rótulos que se pisan (Ataque/Bloqueo/Saque de Cifras a 568).

Además, la ronda 1 **quitó información** que no era decorativa: Jugadores perdió MEDIA/NIVEL/XP/PUNTOS, «Nv · Media» y las descripciones de
atributo; Maestría perdió qué mide cada medalla; Colocar (táctil) quedó en «En el aire, en salto»; Crear cuenta a 568 perdió «con un usuario
(sin @) no podrás recuperar la contraseña»; «Enviar» / «Grupo» sustituyen a Compartir / Ver el grupo; Clubes a 568 perdió «Tu rival juega aquí»;
la hoja final llama «Cifras» en H a lo que en V es «Estadísticas». Criterio de la ronda 2 para cada `display:none` de `.ph`: detrás de un toque, no borrado.

**Vertical.** En vertical no hay `.ph` (PHONE_MQ pide alto ≤ 500 y apaisado), así que en 360-412 px se pinta el CSS de PC, con los textos largos
de PC: 830 recortes en 458 filas (contra 88 en horizontal). Patrones:
(a) cuadrículas y filas de PC encajonadas («icono | título+descripción | estado») que dejan 100-150 px al texto (Partido rápido, Entreno, saques de
firma, equipo del juvenil, resumen del juvenil «FAR / 15- / 11»);
(b) la Carrera con la cabecera de PC (~290 px: MENÚ + avatar + migas cortadas «CIRCUITO REGI…» + nombre y club en 3 líneas) y 2-3 tiras de
pestañas arriba que se cortan («PARTIDO / MENSAJES / JU…»), y los nombres largos de club con patrocinador («vs Clu…», «en Colchones …»);
(c) la acción principal fuera de pantalla o a media altura (Firmar, Ver ofertas, Saltar a la pista, Ver la jornada, Ir al plan: «principal NO»);
(d) modales de PC flotando sobre el menú, que se ve y se mide detrás (cuenta, instalar, aviso del colocador), con la ✕ fuera del panel;
(e) Ajustes con el SÍ/NO en fila aparte y el panel con un max-height de PC (Restablecer cortado con 200 px vacíos debajo);
(f) letra de 9,4-11,5 px (etiquetas de las hojas finales, rótulos de ficha, chips del online, escudos de 6,5 px en la portada);
(g) pantallas que no son juego en marcha tapadas por «Gira el móvil»: 119 de la Carrera (crPortrait, ronda 1) y previa, semana-previa,
carrera-previa, carrera-previa-arbitro y repetición (portraitBlock, con la cuenta atrás corriendo debajo), y el banquillo (botones vivos sobre el velo);
(h) el editor de la disposición táctil roto en vertical («ZU…», «REST…», «LI…»), cuando además no tiene sentido editar en vertical.

Lo que YA funciona en vertical y hay que copiar: online-help, acerca-creditos, online-room (tarjeta + desplazamiento con degradado y flecha +
acción abajo) y la portada / Jugar (3D arriba, botones abajo).

### 8.2 Sistema VERTICAL (paquete `sistema-v`)

**Cuándo.** `html.pv` (ya existe: `pvTier()` en `js/splat.js`) = `pointer:coarse` && `innerWidth ≤ 500` && `innerHeight > innerWidth`. Nunca
en PC (ratón). Se añade el forzado `?pv=1|0` (como `?ph=`) para pruebas. Tablets en vertical (> 500 de ancho) siguen fuera de alcance.

**Contenido = móvil; disposición = orientación.** Helper nuevo `SP.mob()` = `ph || pv`:
- Lo que decide QUÉ SE DICE (textos cortos escritos a mano, nombres cortos de club, fusión de pestañas de la Carrera en 5 apartados con
  Mensajes en el sobre y Palmarés dentro de Vida, rótulos cortos Firma/Ropa/Jornadas/Tabla/Cifras/Ajustes, `phDedupe`, una sola salida en las
  hojas, `data-ph-short`, `.ph-only` / `.ph-no`) pasa a valer con `mob()`. En `career-ui.js` el `PH()` (80 usos) se parte en `PH()` = mob para
  contenido y `PHL()` = phone para disposición (raíl, medidas); igual en `ui.js`, `career-story-ui.js`, `career-world-ui.js`, `account.js`,
  `install.js`, `menu-jugador.js` y `netlobby.js` (unos 30 `phone()` / `contains('ph')`): cada uso se clasifica a mano.
- Lo que decide DÓNDE VA queda con `phone()` (horizontal) y `pv()` (vertical). CSS: `.ph-only` / `.ph-no` valen en `:root:is(.ph,.pv)`; nuevas
  `.pv-only` / `.pv-no` / `.pvh-no` (fuera solo en horizontal). Si un `.ph-only` resulta ser de disposición apaisada, se le añade `.pv-no`.
- `tierKey()` incluye `v`; `vb:tier` salta también al cambiar `pv`, y `vb:ph` salta cuando cambia `mob()` **o** `pv` (girar el móvil repinta Carrera,
  cuenta, sala online y paneles abiertos). Probar el giro en caliente (390x844 ↔ 844x390) sin perder lo escrito.

**Tokens `--pv-*`** (bloque nuevo junto a `--ph-*`, todo bajo `:root.pv`):

| Token | Valor | Uso |
|---|---|---|
| `--pv-g` | max(16px, var(--sl), var(--sr)) | margen lateral |
| `--pv-gt` | max(12px, env(safe-area-inset-top)) | notch / barra de estado |
| `--pv-gb` | max(12px, env(safe-area-inset-bottom)) | barra de gestos |
| `--pv-fw` | calc(100vw - 2 * var(--pv-g)) | ancho de panel / hoja |
| `--pv-body` / `--pv-cap` / `--pv-micro` | 15px / 13px / 12px | cuerpo, secundario, marcas (suelo absoluto 12) |
| `--pv-head` | clamp(18px, 5.4vw, 22px) | título de la cabecera compacta |
| `--pv-title` | clamp(24px, 7.2vw, 30px) | título de pantalla sin cabecera (portada, hojas) |
| `--pv-bar` | 52px | cabecera compacta |
| `--pv-tab-h` | calc(56px + var(--pv-gb)) | barra inferior de pestañas |
| `--pv-cta-h` | 56px | CTA principal (secundario 48px) |
| `--pv-dock-h` | calc(var(--pv-cta-h) + 16px) | dock (más `--pv-tab-h` si hay barra) |
| `--pv-fade` | 24px | degradado de fin de scroll |

**Patrones.**
1. **Una columna.** Paneles a `--pv-fw`; rejillas de PC → 1 columna (< 400 px) o 2 (≥ 400) con `min-width:0` en las celdas de texto; la fila
   «icono | texto | estado» pasa a dos niveles (arriba título + valor/selector, debajo la descripción a todo el ancho) o el estado a una chapa
   absoluta en la esquina. «Etiqueta | contenido» (hojas finales, fichas) → etiqueta encima. Tablas anchas → tarjetas o las columnas de `.ph`.
2. **Cabecera compacta `.pv-bar`** de 52 px en `top: var(--pv-gt)`: [‹ redondo de 44 con aria-label] [título de 1 línea, texto corto a mano]
   [1-2 acciones de 44]. Fuera los títulos héroe de PC en dos o tres líneas («CÓMO SE / JUEGA», «ESTADÍSTICA / DEL / PARTIDO»).
3. **Pestañas.** Carrera: **barra inferior fija `.pv-tabbar`** con los 5 apartados del raíl de horizontal (Partido, Jugador, Club, Liga, Vida),
   icono 24 + rótulo 12, la activa con la mancha amarilla SPLAT detrás del icono, punto rojo, `padding-bottom: var(--pv-gb)`; Mensajes = sobre en
   la cabecera (como en H). Sub-pestañas: con 2-3, segmentado a todo el ancho; con más, tira desplazable con desvanecido en el borde, chevron y la
   activa centrada (`scrollIntoView({inline:'center'})`), o rejilla 2×3 con los rótulos cortos. Un tercer nivel (Regional/Nacional/Hiperliga, país)
   es un selector «‹ España · Hiperliga 2 ›» de 44 o un desplegable en el título del panel. Fondo opaco detrás de toda tira (no se lee el 3D).
4. **Dock de acción `.pv-dock`** fijo abajo (encima de la barra de pestañas si la hay): principal a todo el ancho, o 2/3 con el secundario 1/3 a la
   izquierda; texto con `clamp()` según el ancho, hasta 2 líneas (`white-space:normal`), **nunca elipsis**; lo que se desplaza lleva
   `padding-bottom` = dock + barra + 12. Si hay una decisión pendiente (Firmar, Aceptar, Renovar, Ver ofertas), el dock lleva esa decisión.
5. **Hoja inferior `.pv-sheet`** (modales: cuenta, instalar, avisos, informe del rival, ficha de club, detalle de saque, «Ver más»): anclada abajo,
   ancho completo, radio 20 arriba con asa, `max-height: calc(100dvh - var(--pv-gt) - 24px)`, fondo opaco, velo `rgba(10,6,24,.7)` que tapa TODO
   (cabecera y pestañas incluidas) y deja `inert` lo de detrás; ✕ de 44 dentro (top/right 12); acciones al pie con `--pv-gb`. Vía `SP.sheet()` /
   `SP.modal()` con `pv()`.
6. **El 3D detrás.** Portada, Jugar, Vestuario y previa: el pabellón ocupa la mitad de arriba (identidad) y los botones van abajo. Pantallas de
   datos: panel de borde a borde y el 3D solo asoma velado; nada de huecos reservados al 3D (online-list tiene ~450 px de techo vacío). El marcador
   3D del pabellón no debe leerse detrás de un título o de una tira.
7. **Márgenes seguros.** Todo lo fijo se coloca con `--pv-gt` / `--pv-gb` / `--pv-g`. Comprobar que el viewport lleva `viewport-fit=cover`.
8. **Mínimos.** Texto ≥ 12 px (cuerpo 15, secundario 13); objetivo ≥ 44×44; separación ≥ 8 contando el adorno. Atajos de teclado (`kbd`,
   Ctrl+Intro / Esc) fuera en `:root:is(.ph,.pv)`.
9. **Girar el móvil** solo en el partido en juego (portraitBlock) y en el editor de la disposición táctil (el mismo `#rotate`, texto «Gira el móvil
   para colocar los botones como en el partido», con «Volver»). Fuera `crPortrait()` de `js/ui.js` (la Carrera entera en vertical). Previa,
   semana-previa, carrera-previa(-arbitro) y repetición se ven en vertical; en la previa la cuenta atrás se PARA y un chip abajo dice «Gira el móvil
   para empezar» (empieza al girar). Banquillo: sigue pidiendo girar pero sin botones vivos encima del velo (opción mínima; la tarjeta de banquillo
   en vertical queda anotada como mejora).
10. **SPLAT intacto.** Bocadillos con chorretón, parche cosido para LA acción principal (una por pantalla), sellos como `.ph-sticker` en esquinas,
   tipografía héroe en portada y hojas, paleta y manchas (menos, pero se quedan).

### 8.3 La regla SIN RECORTES

Si no cabe, se reorganiza: dos líneas, otra columna, otra fila, un texto más corto y natural **escrito a mano** (no cortado), o el resto detrás
de un toque (ⓘ en SVG, «Ver más», hoja). Nunca se corta a mitad de palabra. Permitido con «…»: (1) **nombres propios largos dentro de listas**
con el texto entero a un toque (ficha), marcado `data-trunc="name"`; (2) **vistas previas de mensajes** cortadas **por palabra** en JS (helper
`SP.cutWords(texto, n)`), 2 líneas, el mensaje entero al tocar, marcado `data-trunc="preview"`. `mobaudit` cuenta esos dos aparte («recortes
permitidos»); todo lo demás debe dar 0. Botones y títulos de botón: nunca `text-overflow`; letra con `clamp()` y hasta 2 líneas.

| Mal (hoy) | Bien |
|---|---|
| «En la Carrera, el entrenador te pide cos…» | 2 líneas sin clamp con columna fija para el control, o «El entrenador te pide cosas; si cumples, sube tu nota» |
| «SELECCIÓN: EUROPEO VEC DE PL…» + «ESP contra RO…» | Línea propia «Selección · Europeo VEC de Playa» y debajo «Grupo B · J2 · ESP–ROU · Fuera»; «Ver torneo» debajo a la derecha |
| «vs Plátanos El Pipe Voley Niva…» | Nombre corto del club «vs Voley Nivaria» (el de `.ph`); el largo con patrocinador en la ficha |
| «Tranquilidad, tu momento lleg…» | 2 líneas cortadas por palabra («Tranquilidad, tu momento llegará. Pero si…») y el mensaje al tocar |
| «Rotación: … Con 7…» | «Rotación: juegas si la confianza pasa de 60; con 70, titular» + ? con el resto |
| «Aces en un partido: récord 0, bronce …» / «Pegada · récord 0 · bronce 2» | Dos líneas: «Aces en un partido» / «récord 0 · bronce 2» |
| «ABRIR S…», «SEGUIR EL PA…», «VER LA JORNA…» | `clamp(20px, 7vw, 32px)` y 2 líneas; o el rótulo corto de horizontal («Vestuario ›», «Ver jornada») |
| MVP «Ares Belmo…» + chip «2…» | Línea 1: dorsal + «Ares Belmonte»; línea 2: «24 puntos · 19 ataque · 3 bloqueo · 2 aces · Nota 7,8» con `flex-wrap` |
| «2 aces» bajo el degradado | `padding-bottom` = alto del degradado; degradado solo si `scrollHeight > clientHeight`, con flecha ⌄ |
| «C… / Tu …» (Y ahora) | Lista a todo el ancho: icono + «Carrera» / «Tu propio jugador» en dos líneas |
| «Incombustibl» | `hyphens:auto` (lang es) + 3 líneas en la ficha, o 3 columnas a < 640 |
| Separador «|» huérfano al final de línea | `gap` + `flex-wrap` con el separador en `::before` del elemento siguiente; cifras en `.nw` |

### 8.4 Tabla por pantalla (ronda 2)

H = horizontal (568/844/915), V = vertical (360/390/412); notas de las revisiones (H/V). `*` = playa y pista. Paquete entre corchetes. Lo común a
una zona (cabecera, pestañas, dock, hoja, letra mínima) lo hace el paquete de esa zona para todas sus pantallas; aquí va lo propio de cada una.

**Portada, Jugar, menús, online, opiniones [menus-v]**

| id | H/V | arreglo |
|---|---|---|
| home | 8/7 | V: vuelven el subtítulo corto de JUGAR y «Tu aspecto»; bloque de botones con `--pv-gb` + 12; secundarios a 13 px; v1.22.1 con toque de 44 |
| home-carrera | 8/4 | V: tarjeta Próximo: fila pequeña «BRI en PEN · T1 J5» y la sede entera debajo (2 líneas, clamp 18-24); «Continuar» aparte; siglas ≥ 9 px o fuera |
| home-seguir, home-seguir-carrera, home-jugarya | 8/5-6 | V: título de la tarjeta Seguir clamp(18px, 5.6vw, 26px) en 2 líneas; subtítulo corto de JUGAR |
| jugar | 8/8 | V: «Entreno» (rótulo de .ph) y 13 px en las tres baldosas |
| quick-2v2, quick-6v6, quick-corto | 8/5 | V: fila en dos niveles (etiqueta + ‹ valor › arriba, descripción entera debajo); título en 1 línea; ¡A JUGAR! en el dock; lista con degradado en 740 |
| entreno | 7/3 | V: estado como chapa NUEVO en la esquina; descripción en 2 líneas; Peloteo libre como botón ancho abajo (título ~26 px). H568: padding-top en Peloteo |
| comojuega-1 … comojuega-6 | 8/6-7 | V: `.pv-bar` con notch; tarjeta flex:1; Anterior/Siguiente abajo; Anterior = ‹ redondo de 56; -4: margen entre ilustración y «PASO»; -6: reglas en 1 columna < 400 |
| jugadores-g0, -g1, -g2 | 6/7 | H: vuelve la tira «50 MEDIA · NIVEL 1 · 0/120 XP · PUNTOS 0» y la descripción del atributo (ⓘ por fila o 2ª línea). V: pestañas con icono + rótulo; «Nv 1» a 12 |
| acerca-novedades, acerca-creditos | 8/8 | V: ENTENDIDO en el dock; el texto de 11 a 12 |
| opiniones-sug, opiniones-bug | 8/6 | V: fuera los atajos kbd; Cancelar/Enviar en barra de dos abajo |
| aviso-colocador | 7/7 | V: `.pv-sheet` opaca con velo; «No volver a mostrar» como enlace. H: quitar la raya que tacha «remate» |
| primer-partido | 7/4 | V: cabecera arriba, VER CÓMO SE JUEGA y JUGAR YA a todo el ancho abajo. H568: padding-top del título del botón |
| instalar-ios, -android, -app | 8/6 | V: `.pv-sheet`; ✕ dentro; pasos en 1 columna (dibujo de 72 a la izquierda); DIRECTO oculto con hoja abierta |
| online-list, online-aviso | 5/5 | V: Crear sala + Código en el dock; ? y refrescar en la cabecera; sede en 2 líneas con padding-top 8; chips a 12; salas llenas con la tarjeta atenuada y el texto legible; aviso como tostada arriba. H: contraste de Llena / Otra versión y vuelve la chapa Igualado |
| online-create | 6/4 | V: rótulo del botón con clamp sin elipsis; lista con degradado y flecha; nota fuera del scroll. H: «Jugador 1120» y la sede enteros (Titan 20 o sin la chapa VS) |
| online-room | 7/8 | H844/915: la tarjeta crece con su contenido; la tostada debajo, sin pisar las chapas |
| online-help, online-noacc, online-off, online-nortc, online-room-rival | 8/8-9 | Mantener; V: botón principal a todo el ancho; Volver abajo en nortc |

**Ajustes, controles, vestuario, perfil, retos, cuenta [paneles-v]**

| id | H/V | arreglo |
|---|---|---|
| ajustes-audio, -image, -cam, -a11y, -info | 8-9/6-7 | V: fila de .ph (texto a la izquierda, toggle a la derecha en la misma fila); deslizador a todo el ancho con el % en columna fija; selectores de 3+ a todo el ancho; 7 pestañas de icono de 44 que caben en 360 (el nombre de la sección como título del panel); panel hasta abajo (100dvh); info: título y valor en la misma fila |
| ajustes-game | 6/7 | H568: descripción en 2 líneas con columna fija de ~150 para el control; Ambiente con el selector debajo si el panel < 600; ⓘ en SVG. V: como audio |
| ajustes-kit | 8/4 | V: panel con altura de 100dvh; muestras en `repeat(auto-fill, 44px)` desde la izquierda; Restablecer como pie fijo; ⌄ en su pie |
| controles-keyboard | 8/7 | V: subtítulos a 12; teclas de 40×40 |
| controles-gamepad | 6/7 | H568: «En el suelo: coloca o pasa» sin clamp o 1 columna < 640; teclas de 44 de alto. V: 12 px |
| controles-touch, pausa-controles | 6/6 | H y V: tarjeta por acción (nombre + chips de botones arriba, descripción ENTERA debajo); en H 2 columnas con `align-items:start` y las largas (Finta, Al colocar, Colocar, Salto con dirección) a `grid-column:1/-1`; Colocar recupera su texto completo |
| controles-touch-editor, -zurdos | 8/2 | V: pide girar (`#rotate` con su texto y Volver). H568: lupa y pausa ocultas mientras se edita (o 12 px de margen) |
| vestuario-pelo, -cabeza, -cara, -cuerpo, -brazos, -piernas | 8/7 | V: muñeco en el 40-45 % de arriba y la lista con flex:1; botones de giro en una fila bajo el muñeco; marcador 3D oculto; margen del notch. H915: margen entre la lista y la columna derecha |
| vestuario-colores | 7/6 | V: la nota encima de la lista o en panel oscuro con `--pv-gb`; sin text-stroke (también H) |
| perfil-vestuario, -insignias, -entreno, -carrera, -retos, -sedes, -hitos, -cuaderno | 7/4 | V: cabecera en 3 líneas («240 / 300 XP», «Siguiente premio: Nv 14 · …», chips nowrap «212 partidos» «131 victorias» «4 de 6 sedes»); pestañas en rejilla 4×2 (icono + contador) o tira con la activa centrada; avisos en una cola arriba bajo el notch; 12 px. H: raíl lateral desplazable con la activa visible (llega a Cuaderno); -carrera H568: `hyphens:auto` y 3 líneas en las fichas |
| perfil-cuaderno-pie | 8/3 | V: descripción entera en un panel a todo el ancho (o hoja) sobre fondo oscuro y «Fijar en la vitrina» a todo el ancho abajo |
| retos-hoy | 8/5 | V: ¡A JUGAR! clamp(28px, 9vw, 44px) sin elipsis, fijo abajo; sello a 120 px; fecha nowrap «24 nov»; pie en 2 filas limpias |
| retos-maestria | 6/4 | H y V: dos líneas por medalla («Aces en un partido» / «récord 0 · bronce 2»); V una columna a 13 px; H rejilla sin huecos (`dense`, rótulos de grupo a todo el ancho) |
| retos-semana | 8/6 | V: sello pequeño; chips en 2 filas; pie con `--pv-gb`; sin overflow en ¡A jugar! |
| retos-semana-grupo | 7/5 | V: mapa en el flujo con aspect-ratio (se ven las 6 zonas y la RED). H y V: chip activo con texto oscuro; título sin contorno; Compartir con icono + texto. H568: padding-bottom para la RED |
| cuenta-entrar, -crear, -dentro, -borrar | 6-8/7-8 | V: `.pv-sheet` con velo; ✕ dentro; placeholders; acciones apiladas a todo el ancho (borrar: «No, volver» primero). H568 crear: vuelve el aviso «Con usuario (sin @) no podrás recuperar la contraseña» y «Ahora no» como enlace |

**Partido, pausa, hoja final, estadística, semana, previa [partido-v]**

| id | H/V | arreglo |
|---|---|---|
| final-resumen | 7/6 | V: cabecera compacta (rótulo de 1 línea, ¡VICTORIA! ~44, marcador y sets en una fila, «Ver celebración» como ojo junto al título o en las acciones); etiquetas encima del contenido; MVP en 2×2 sin degradado encima; 12 px. H844: el panel crece hasta Revancha o padding = degradado |
| final-primero | 5/3 | V: «Y ahora» como lista a todo el ancho bajo el MVP (icono + título + subtítulo, 48 px). H568: orden resumen → MVP → «Y ahora» |
| final-stats | 5/6 | H y V: cabeceras de columna «Ata.» «Bloq.» «Saq.» (o iconos) en columnas fijas de 44; Puntos arriba; «Estadística del partido» como enlace al pie |
| final-jugadas | 6/8 | H568: filas de 48 y «Verlas todas» en la cabecera de la pestaña |
| final-reto | 7/5 | V: sello de 64 junto a ¡VICTORIA!, sets en una fila, medallas en una fila, XP con margen. H844: el reto primero y el MVP en una línea |
| final-entreno | 8/7 | V: título ~40 en una línea; secundarios de 52 al pie con `--pv-gb` |
| semana-hoja | 5/7 | H: «Compartir» y «El grupo» (o icono + texto); MVP en una línea al final de Situación. V: etiquetas encima, 12 px |
| pausa, semana-pausa | 8/7 | V: marcador bajo PAUSA arriba; acciones abajo con `--pv-gb`; «Opinar» (como en H); el aviso de la semana pegado a sus botones; sin overflow en SEGUIR JUGANDO |
| pausa-bug | 7/5 | V: fuera kbd; título de 1 línea; chips en rejilla de 3; Cancelar/Enviar abajo |
| pausa-ajustes | 8/6 | V: igual que Ajustes (pestañas de icono que caben; toggle en la fila) |
| cambios-6v6, -elegido | 8/7 | V: hoja anclada abajo; pista en rejilla 3×2 como en H; banquillo en tira; «Tú» dentro de la ficha (también H) |
| estadistica-2v2, -6v6 | 5/6 | H568: ‹ + «Estadística» + equipos en una fila; sets y secciones en una tira con desvanecido. V: título de 1 línea, sets en rejilla de N columnas, índice de secciones pegado arriba; etiqueta del gráfico sin pisar SET; 12 px |
| previa, semana-previa, carrera-previa, carrera-previa-arbitro | 8/2 | V: se ven (Tú / VS / CPU apilados, la situación, chips de árbitro enteros, ROC/SOL sin clamp con line-height ≥ 1.1); cuenta atrás parada y chip «Gira el móvil para empezar» |
| repeticion | 8/2 | V: lienzo con la cámara de repetición y la tarjeta abajo; si no se ve bien, banner «Gira para verla mejor» en la zona del pulgar, no el aviso a pantalla completa |
| carrera-banquillo | 8/3 | V: sigue pidiendo girar; botones del banquillo ocultos bajo el velo; salida visible |
| hud-sena-cinta | 5/8 | H: con la cinta activa, la seña bajo el marcador (nunca en la franja central de arriba) |
| hud-6v6, hud-2v2-zurdos, hud-2v2-peloteo | 6-8/8 | H y V: `#coach` con cápsula, `white-space:normal`, 2 líneas, sin elipsis; 568 max-width 60vw |
| partido-frenar-playa, -pista | 7/8 | Texto completo y natural («Iker se lanza a por el balón»); 568: botones de 44 que no pisan Saltar |
| hud-punto, hud-saque-firma, hud-entreno, hud-sena, hud-sena-bajo, hud-sena-5s | 7-8/8 | H568: cinta con max-width que no llega a los botones; marcador a .6 con la diana; contador del zoom separado en el entreno; seña un 15 % menor |
| hud-2v2, hud-cambio, hud-zona, hud-zona-6v6 | 8/8 | Mantener (V: aviso de girar, lo esperado) |

**Carrera: marco y hub del Partido [carrera-marco-v]** (y lo común a TODA la Carrera en vertical: cabecera, barra inferior, sub-pestañas, dock, Faro)

| id | H/V | arreglo |
|---|---|---|
| carrera-*-match | 6/4 | V: tarjeta del rival con la meta en dos chips dentro del padding y el rival con nombre corto; mentor plegado a una tira (avatar + título + ⓘ → hoja) debajo de las acciones; Jugar/Simular en el dock. H: línea de la Selección en su fila (2 líneas, códigos ESP–ROU); mentor en 2 líneas completas o texto corto a mano |
| carrera-*-informe, carrera-*-informe-tira | 7/5 | V: etiqueta del partido en dos filas; pabellón a 18 en 2 líneas; tira del mentor plegable. H: la tira en 2 líneas y un toque abre el mensaje |
| carrera-*-partido-baja | 6/4-5 | H: Selección sin cortar; «+ BAJA» → «Más (3)»; 568 padding-bottom = barra. V: «Ver jornada» sin elipsis; meta abreviada; Selección visible en la primera pantalla |
| carrera-pista-natl-tarjeta, carrera-pista-cesion-aviso | 6/4-5 | H: Selección / Clasificación en 2 líneas. V: la tarjeta de la Selección / el aviso de cesión arriba; Faro plegado |
| carrera-playa-natl-verano, carrera-playa-fin-cesion, carrera-pista-gala | 6-8/4 | V: la noticia arriba (Selección / fin de cesión / Gala) y el resumen plegado; «Ver ofertas» / «Seguir» en el dock; «Fin de la T1»; datos clave/valor por línea. H: fin de cesión antes de la Gala |
| carrera-pista-propuesta-puesto | 6/3 | V: la propuesta arriba y Aceptar/Rechazar en el dock. H568: padding-bottom para leer las consecuencias |
| carrera-*-estrellas-voto, carrera-*-estrellas-finde | 7-8/5-6 | V: «Pedir el voto · 2/3» (texto de H); secundarios de 48; podio con nombres de pila; dock con «Ver la jornada» |
| carrera-a-medias | 8/4 | V: «Seguir el partido» en el dock sin elipsis; tarjeta centrada; «Regional · J5/14» |
| carrera-*-lesion | 8/6 | V: franja en 1 línea con el ? a la derecha; Volver antes / Fisio en fila de 2 (56); principal en el dock |
| carrera-pista-aviso-colocador | 8/5 | V: `.pv-sheet` opaca sobre toda la Carrera; Activar abajo. H: la raya sobre «remate» |

**Carrera: Jugador, Club, selección, cesiones, traspasos, plan [carrera-jugador-club-v]**

| id | H/V | arreglo |
|---|---|---|
| carrera-*-player-phys, -def, -atk | 8/6 | V: ficha compacta de 1 fila con chip «12 puntos»; atributo en dos niveles (nombre + número + +1 de 44 / barra a todo el ancho); pie del entreno en 1 línea con ⓘ |
| carrera-*-player-badges, carrera-playa-saque-firma | 8/2 | V: lista de 1 columna (2 desde 390) de tarjetas: título + «✓ GOLPEAR y SALTAR» / «🔒 Pide saque 62», descripción breve de .ph y la larga tras ⓘ; gestos en 2×2; sub-pestaña «Firma» |
| carrera-*-player-train | 6-8/6 | H568: «Elegir plan» sin pisar el ?. V: ? en la fila del título; botones de lesión de 56-64 en fila de 2; «Elegir plan» visible o en el dock |
| carrera-*-player-look | 8/5 | V: «Vestuario ›» (o «Abrir el vestuario» con clamp, sin elipsis) en el dock; título de 1 línea; contador en chip |
| carrera-*-club-info | 7-8/6 | H568: subtítulo en 2 líneas (patrocinador / «★★ · Hiperliga 2»). V: nombre corto de título y patrocinador pequeño; `.ph-kv` de una columna; 12 px |
| carrera-playa-club-mate, carrera-pista-club-team, carrera-*-club-people | 8/7 | V: Titular/Suplente en la fila del nombre; «+3 · Partido con el equipo · esta jornada» como chip |
| carrera-*-club-contract, carrera-pista-traspaso-renovar, carrera-pista-traspaso-no | 6-9/3-6 | H568: «Titular: juegas de inicio. Si te deja 2 jornadas en el banquillo, puedes irte sin pegas.» + ?. V: clave/valor de 1 columna; la decisión (Renovación / propuesta) ARRIBA y Firmar/Aceptarlo + Prefiero salir en el dock; cobros tras ⓘ |
| carrera-*-club-offers | 8/6-7 | V: texto corto + ⓘ; acción de 48 si existe |
| carrera-*-club-ficha, carrera-*-club-rencor | 8-9/6 | V: ficha como hoja: ‹ redondo + escudo + nombre corto, «Hiperliga 2 · 1967 · La Colmena», nombre largo pequeño; franja de rencor arriba |
| carrera-*-club-natl, carrera-pista-club-natl-clasif, carrera-playa-club-natl-verano | 7-8/5-6 | V: Jugar + Simular en el dock; bandera de 40 en línea; cabecera de la tabla a 12. H568: la tabla del grupo visible al desplazar (padding-bottom) |
| carrera-*-cesiones | 6/7 | H568: datos en 2 líneas, chips con wrap, nombre corto + largo debajo, «Ir cedido» debajo a la derecha. V: «Estás de baja…» encima del botón |
| carrera-pista-cedido | 7/6 | H: «Vuelves a Voley Sanroqueño». V: franja «CEDIDO» sin nombre; «Sin jugar»; 12 px |
| carrera-playa-plan, carrera-pista-pedir-puesto | 7/5-6 | V: explicación tras ⓘ; Cerrar como ✕; ★ Recomendado delante del título. H: ? junto al ✕ |
| carrera-pista-natl-palmares | 6/6 | V: rótulos a 12-13, 2 columnas a 360; sub-pestaña «Vitrina». H568: la categoría como título encima de su fila |

**Carrera: Mensajes, Liga, Vida, Palmarés, premios [carrera-liga-vida-v]**

| id | H/V | arreglo |
|---|---|---|
| carrera-*-inbox | 7/5-6 | H y V: vista previa con `SP.cutWords` a 2 líneas (o un campo `preview` escrito a mano). V: Bandeja · Redes como segmentado; contador en la pestaña; avatares de 40 |
| carrera-*-inbox-wall | 8/6 | V: 3 botones de publicar compactos (64 de alto) con los efectos en chips nowrap «Fama ▲»; 12-13 px |
| carrera-*-league-table | 8-9/4 | V: «Circuito Regional ▾ · J4/14» o selector «‹ España · Hiperliga 2 ›» de 44; fila «# · escudo 24 · nombre corto · PJ G P PTS» de 44; tu fila a la vista |
| carrera-*-league-cal | 9/3 | V: nombre corto del rival; sin «Pendiente» (fila apagada); «Próximo» como chip; JEFE como chip de 12 o 👑 |
| carrera-*-league-news | 7-8/6-7 | H568: titular sin clamp (3 líneas) o titular corto en los datos. V: nombres cortos, cuerpo 15, T1 J4 a 12, marcadores nowrap |
| carrera-pista-league-cups | 8/6 | V: lista de 3 filas con su condición debajo |
| carrera-*-league-clubs | 8/5-6 | V: selector de categoría; filas de una línea «1r · 62 ›». H568: chip «Rival» en la fila marcada. Ordinales en una sola forma |
| carrera-*-honors-titles, carrera-*-estrellas-vitrina | 7-8/6 | H: nombres de trofeo enteros (3 líneas o «Final a 4 Mundial», «Naciones de Playa»). V: lista o rejilla con icono de 40-64, detalle al tocar, 12-13 px; sub-pestaña «Vitrina» |
| carrera-*-honors-seasons | 8/6-7 | Con el marco nuevo basta |
| carrera-*-honors-opts | 8-9/4-6 | V: dificultad en 2×2 o «‹ Normal ›»; explicación de 1 línea + ?; «Crear Carrera de pista» con el subtítulo en 2 líneas |
| carrera-*-honors-stats | 8/4-5 | V: temporadas como tarjetas (T1 · club corto / Puesto PJ PG Puntos Nota); caja 2×2. H568: la sub-pestaña activa centrada |
| carrera-*-life-fame, carrera-*-life-legacy | 8/7 | V: explicaciones a 1-2 líneas + ⓘ; los nombres como en H (Vida › Fama…) |
| carrera-*-life-shop | 9/6-7 | V: nombre en letra de cuerpo en 1 línea; botón de precio compacto «1.500 €»; Ahorros tras ⓘ |
| carrera-*-life-goals | 8-9/6-7 | V: logro en 3 líneas (título + premio / descripción / barra con «1/5») |
| carrera-*-life-pass | 8/7 | V: rejilla de niveles de 4-5 columnas (56); etiquetas cortas en la caja |
| carrera-*-league-race, carrera-*-premios-datos | 8/5 | V: rejilla [pos 32][nombre 1fr][nota], club y edad en una 2ª línea con wrap; pestañas de premio con los rótulos de H; reglas tras ⓘ |

**Carrera: creación, ofertas, juvenil, prueba, hojas [carrera-flujo-v]**

| id | H/V | arreglo |
|---|---|---|
| carrera-crear-playa, -pista, -juvenil | 7/5-6 | H: subtítulo de Inicio en 2 líneas o «Una temporada con tu instituto»; 568 sin tarjetas asomando bajo el sticky. V: sin el `small` de la cabecera; Nombre+Dorsal, Inicio, Rol/Puesto (2×3); explicación plegada con «Ver más»; dock de 2 líneas |
| carrera-ofertas-playa, -pista, -rencor-playa, -rencor-pista | 8/4 | V: maqueta compacta de H (cabecera del club a 22 px en 2 líneas, 2×2 Rol/Sueldo/Media/Objetivo, chips, ficha en hoja); dock [Pedir más rol][Firmar]; pestañas de clubes con desvanecido y «1/4». H568 rencor: la última pestaña no queda bajo el sello |
| carrera-juvenil-intro-*, carrera-juvenil-intro3-* | 8/7 | V: dock con Siguiente (o [Atrás][¡A la liguilla!]); «Ir directo a las pruebas» secundario discreto; sin «|» huérfanos |
| carrera-juvenil-temporada-* | 8/6 | V: kicker «J3 de 5», la liga en el título (2 líneas); partido apilado, un equipo por línea; dock [Simular][Jugar partido] |
| carrera-juvenil-equipo-* | 8/3 | V: lista de 1 columna con ▾ (la de H) |
| carrera-juvenil-chat-* | 8/8 | Solo la cabecera del juvenil |
| carrera-juvenil-informe-* | 8/5 | V: «8/10», «4/5»; el círculo de la nota en su fila; Ver ofertas en el dock; ? sin montarse |
| carrera-juvenil-hoja | 8/3 | V (PC NO se toca): nota arriba y resumen debajo a todo el ancho (`min-width:0`); «≤ 2 errores»; 12 px |
| carrera-prueba-previa-playa, -pista | 8/3-4 | V: kicker «Prueba», título «Ari Lluch»; dock [Simular (21 %)][Saltar a la pista] sin elipsis; reglamento tras ⓘ; objetivos en chips |
| carrera-prueba-hoja, carrera-prueba-suspendida | 8/7 | V: «Ver celebración» como ojo en la esquina; nota 6,9 a 13; chips a todo el ancho |
| carrera-hoja-final, carrera-natl-partido-hoja, carrera-natl-partido-hoja-derrota | 7/6 | H: MVP en la primera pantalla (línea compacta) y sin degradado encima. V: chips Lo mejor / A mejorar enteros a todo el ancho; MVP en una fila con wrap; kicker sin pisar; 12 px |
| carrera-resumen-jornada | 6/6 | H568 y V: MVP en 2 líneas (nombre entero / cifras con wrap); en V etiquetas encima; Clasificación con tu fila ±1 y «Ver tabla» |
| carrera-resumen-stats | 8/7 | V: fuera el bocadillo redundante; barras de ataque y bloqueo; cabeceras a 12 |
| carrera-sesion-hoja, carrera-estrellas-concurso-hoja | 8/6-7 | V: título de 36-40; dock [Volver a la Carrera][Siguiente]; clasificación a todo el ancho; «2º intento» sin rebosar |
| carrera-estrellas-partido-hoja | 8/3 | V: «Equipo Sol / 21-18 / Equipo Luna» apilado; «Tu nota 7,8 · MVP: tú» debajo; la tarjeta arriba. Revisar el marcador TÚ/VAL frente a Sol/Luna |

### 8.5 Paquetes de la ronda 2 (en serie sobre el mismo worktree)

1. `sistema-v` — `SP.mob()`, tokens `--pv-*`, componentes `.pv-bar` / `.pv-tabbar` / `.pv-dock` / `.pv-sheet`, utilidades, `SP.cutWords`,
   `data-trunc`, fuera `crPortrait`, eventos de giro y arreglos de `mobaudit` (métricas nuevas, estado entre pantallas).
2. `recortes` — los 88 recortes de horizontal y la información que quitó la ronda 1 (todo bajo `.ph`).
3. `carrera-marco-v` — cabecera, barra inferior, sub-pestañas, dock y Faro de la Carrera en vertical; hub del Partido y avisos/decisiones.
4. `carrera-jugador-club-v` — Jugador, Club, selección, lesiones, cesiones, traspasos, plan.
5. `carrera-liga-vida-v` — Mensajes, Liga, Vida, Palmarés, premios, vitrina de Estrellas.
6. `carrera-flujo-v` — crear, ofertas, juvenil, prueba, hojas de partido de la Carrera.
7. `menus-v` — portada, Jugar, partido rápido, entreno, Cómo se juega, Jugadores, Acerca de, Opiniones, Instalar, avisos, Online.
8. `paneles-v` — Ajustes, Controles (y editor), Vestuario, Perfil, Retos, Cuenta.
9. `partido-v` — previa y repetición en vertical, pausa, cambios, hoja final, estadística, semana, banquillo; y los arreglos del HUD en horizontal.

Cada paquete: commits en castellano con las dos líneas de atribución; sin push / merge / deploy / versión; sin `git stash`; pasadas y pruebas en
primer plano; anotar bajo «### 8.6 Registro de la ronda 2» qué se hizo, las métricas (recortes no permitidos, < 12, < 44, principal NO, girar)
y lo pendiente.

### 8.6 Registro de la ronda 2

(Cada paquete añade aquí su apartado: `#### 8.6.N Paquete <key> (fecha)`.)

#### 8.6.1 Paquete sistema-v (24-nov-2026)

Sistema común de vertical sobre el que trabajan los 8 paquetes siguientes; no rediseña pantallas. PC: todo CSS nuevo bajo `:root.pv` (prefijo
`:root.pv:not(#_):not(#_):not(#_)`) o en utilidades que solo tocan `.ph`/`.pv`; todo JS de disposición tras `SP.phone()` / `SP.pv()` / `SP.mob()`.

**JS (`js/splat.js`, `VB.Splat`)**
- `mob()` = `html.ph || html.pv` (QUÉ SE DICE) · `pv()` · `phone()` (DÓNDE VA, apaisado). En horizontal `mob() == phone()`.
- `?pv=1|0` fuerza el vertical (con `?pv=1` sin `?ph=` se quita `.ph`); el `<script>` del `<head>` de `index.html` ya pone `html.pv` antes del
  primer pintado (táctil, ancho ≤ 500, alto > ancho).
- `tierKey()` lleva `v`; `vb:tier` salta con cualquier cambio de `ph`/`ph-s`/`ph-w`/`pv`; `vb:ph` salta cuando cambia `mob()` **o** `pv` (girar).
  `detail` = `{ph, pv, mob, s, w, flip}`. Comprobado con `tools/girotest.js` (nuevo, 21 comprobaciones): 390x844 ↔ 844x390 repinta Carrera,
  cuenta (usuario y contraseña siguen), crear jugador (el nombre sigue) y sala online.
- `cutWords(texto, n)`: corta por palabra (nunca a mitad) y añade «…»; quien lo use marca el nodo `data-trunc="preview"`. Nombres propios largos
  con elipsis CSS: `data-trunc="name"` (y la ficha a un toque). mobaudit los cuenta aparte («permitidos»).
- `more(el)` en el móvil (no en las `.tb-row`): desvanecido solo si `scrollHeight > clientHeight + 2` y `padding-bottom` en línea =
  max(el suyo, `--ph-fade` / `--pv-fade`) mientras hay algo que desplazar. PC igual.
- `sheet()` con `pv()`: la hoja lleva `.pv-sheet`, el velo `.pv-veil` y lo de detrás `inert` (`inertBehind(keep, …)`, exportado); sin «Cerrar»
  al pie con `mob()` (una sola salida). `modal(el, {sheet})`: en vertical velo `.pv-veil`, `inert` detrás y, con `sheet` (selector o `true`),
  ese panel pasa a `.pv-sheet` mientras está abierto (el aviso del colocador ya lo pide: `{sheet:'.sn-sheet'}`).
- `shorten()` (`data-ph-short`), `tbl()` (`data-ph-cols`) y `toastClear()` pasan a `mob()`; `fitSeg` y `helpFit` siguen con `phone()`.

**Clasificación de «es móvil»** (contenido → `mob()`; disposición → `phone()`):
- `js/career-ui.js`: `PH()` = mob (los ~80 usos: nombres cortos, `phKick`, apartados fundidos `TABS_PH`/`LIFE_PH`, sobre `.cr-mail`, `SUB_PH`,
  `phDedupe`, `phDecide`, `phDock`, `phFlow`, `phReveal`, `qBtn`, `lgPick`, `phCountryRow`, `HLP.ph` de las extensiones…). `PHL()` nuevo = phone:
  `phFitDock` (encoger a una línea), `phModeSeg` en la cabecera / `modeSeg` en el cuerpo, «Ir directo a las pruebas» a la cabecera. El raíl
  (`.sp-vtabs`) lo decide ui.js `fitTabs` con `phone()`: en vertical las 5 pestañas salen arriba en fila (sin maquetar). `PV_CSS` (nuevo, prefijo
  `PV`): solo el sobre `.cr-mail` y `#crDock` en vertical (flex, 2/3 + 1/3, texto en dos líneas sin elipsis).
- `js/ui.js`: `phMob()` nuevo. A mob: píldoras de la previa (`introLT`), nombre de pila en el XP de la hoja, marcadores `nw` de la situación,
  «Pinta: …» fuera, `LK_LABEL_PH`, «Editar disposición», viñetas `TUT_PH` + «Más detalle», `rtTxtPh` de Maestría, `SP.modal` del aviso del
  colocador, `endMore` (ver abajo). Se quedan con phone: `phHud` (HUD, hoja final `endTools`), `fitTabs` (raíl/tira), toasts de Vestuario/Perfil,
  filas táctiles de Controles, `phPanel`/`phNow` (fitSeg), editor táctil, banner de la zona, subtítulo de JUGAR (`subOn`: depende del sello).
- `career-story-ui.js` («N mensajes» fuera), `career-world-ui.js` (trofeos tocables), `career-dev.js` (`phNow`: tocar elige y se confirma),
  `menu-jugador.js` («Continuar»): mob. `account.js`, `install.js`, `netlobby.js`, `input.js`: phone (disposición; los paquetes v deciden).
- `endMore` (hoja final) con `phMob()`: desvanecido solo con algo debajo, se vuelve a medir con ResizeObserver/MutationObserver y, si queda
  puesto, otra medida a los 400 ms (hasta 3): se quedaba pegado y tapaba «3 de bloqueo · 2 aces» del MVP (lo entrante desborda unos px un
  momento sin cambiar de tamaño). Mejora también en horizontal.

**CSS (`index.html`)**
- Utilidades: `:root:not(.ph):not(.pv) .ph-only` · `:root:is(.ph,.pv) .ph-no` / `.ph-hide` · nuevas `.pv-only` · `.pv-no` · `.pvh-no` (fuera solo en
  horizontal). `.pv-no` puesto a: los «?» `.sp-q.ph-only` de Partido rápido (rompían la lista), `.pf-n` del botón Perfil, `.sem-vw` (Mapa | Grupo),
  `.fb-attq` (la «i» de «Se adjunta…», que en vertical se lee entero). Atajos `.fb-keys` fuera también con `.pv`.
- Tokens `:root.pv{…}` (junto a `:root.ph.ph-s`): `--pv-g` · `--pv-gt` · `--pv-gb` · `--pv-fw` · `--pv-body` 15 · `--pv-cap` 13 · `--pv-micro` 12 ·
  `--pv-head` clamp(18, 5.4vw, 22) · `--pv-title` clamp(24, 7.2vw, 30) · `--pv-bar` 52 · `--pv-tab-h` 56 + gb · `--pv-cta-h` 56 · `--pv-btn-h` 48 ·
  `--pv-dock-h` cta + 16 · `--pv-fade` 24 · `--pv-tap` 44 · `--pv-gap` 8 · `--pv-pad` 12. `viewport-fit=cover` ya estaba.
- Componentes (bloque «— móvil en VERTICAL (.pv) — componentes compartidos», antes de `/* ==== fin SPLAT */`, documentados en su comentario):
  `.pv-bar` (`.pv-bk` o `.sp-back` · `.pv-bt` hasta 2 líneas, nunca elipsis · `.pv-ba`) · `.pv-tabbar` (hijos con `svg` 24 + `span` 12; activa
  `.on`/`[aria-selected=true]`/`[aria-current=page]` con mancha amarilla; `.dot` / `.tb-b`) · `.pv-dock` (+ `.pv-dock-tab` encima de la barra;
  principal `.sp-patch`/`.pri`/`[data-pv-main]` a 2/3) · `.pv-docked` · `.pv-tabbed` · `.pv-strip` dentro de `.pv-stripw` (chevrón con `.sp-more-x`) ·
  `.pv-sheet` (genérica con 4 `:not(#_)` y la de `#spSheets`) · `.pv-veil`. Desvanecido de los paneles a `--pv-fade`.
- Textos cortos que ya existían con su par largo escondido por CSS de `.ph`, también en vertical: aviso del colocador (`.sn-sh` / `.sn-lg`,
  «Más») y antetítulo corto de la hoja de Carrera (`.ek-s`). «Más detalle» de Cómo se juega en su fila (no se come «Siguiente»).

**Aviso de girar**: fuera `crPortrait()` y su `'C'` de `syncScreens` (ui.js); `el.rotate.hidden = !ctx.portraitBlock` como en la base. La
Carrera entera se ve en vertical (aún sin maquetar). El partido en juego sigue con `ctx.portraitBlock`.

**Arnés** (`tools/mobaudit.js`, `tools/mobaudit-page.js`, `tools/mobcompare.js`)
- Recortes: `clippedOk` / `nClippedOk` (antepasado `data-trunc="name"|"preview"`; columna **perm**); los demás en `clipped[]` con `full` (texto
  entero) y listados al final de `summary.txt` («Recortes no permitidos (texto entero), tapado por el pie y pisados…»). Recorte **`o`**
  (`nClipO`): contenedor con overflow hidden/clip (o una fila que se desplaza de lado sin desvanecido ni máscara, que no sea tira de pestañas)
  cuyo hijo de texto o tabla se sale («Caducan al jugar» de cesiones a 568).
- **pie** (`m.foot = {n, list}`, `footCover()` tras `scrollAll`): texto que con todo desplazado al final sigue bajo algo opaco de abajo que no es
  de su zona (dock, barra) o bajo el desvanecido `.sp-more`/`.more` que ya no se puede apartar (comprobado: con `.more` puesto a mano en la hoja
  final a 844 da los 4 datos del MVP).
- **pis** (`m.pis = {n, list}`): rótulos de texto no tocables que se pisan en el mismo panel (núcleo del 56 % de cada línea; Ataque/Bloqueo/Saque
  de Cifras a 568). `rot` sigue igual.
- Estado: `HEAL` cura la lesión de las Carreras de muestra antes de cada fila de la Carrera que no es `-lesion`/`-partido-baja` (antes la
  natl-tarjeta, las Estrellas, la propuesta de puesto, Entreno, Contrato… salían «De baja» / «+ BAJA» heredado de la fila anterior).
- Columna **girar**: qué pantallas enseñan `#rotate` (ya no se aparta nada). Fila con **`land: true`** (partido-frenar-*): en vertical se abre
  apaisado y se gira (antes «no se pudo abrir» en vertical). `--desktop --sizes a,b` mide esos tamaños sin táctil y solo una vez.
- mobcompare: columnas **permitidos**, **recortes o**, **tapado-pie**, **pisados**; tercer argumento = salida; en el `.md`, «Por pantalla» (cada
  pantalla × tamaño que cambia, ▲/▼). Con una pasada vieja (sin `foot`), «recortes» se compara sin los `o`.

**Pasadas** (`…/scratchpad/movil2/`; v1 y h1 con DPR 2; pc1 con DPR 1 como `pcbase`; hojas de contactos `v1/contact.html`, `h1/contact.html`;
comparaciones `v1.html/.md`, `h1.html/.md`, `pc1.html/.md`). 241 pantallas, **0 fallos al abrir** en vertical y en horizontal (v0 tenía 6:
frenar); en PC, los 2 de siempre (frenar a 1024, como `pcbase`).

| pasada | recortes no permitidos (de ellos `o`) | permitidos | tapado-pie | pisados | < 12 | < 44 | principal NO | girar |
|---|---|---|---|---|---|---|---|---|
| v0 (antes) | 830 | – | – | – | 1436 | 193 | 62 | 141 pantallas (119 de Carrera) |
| **v1** | **501 (24)** | 0 | 0 | 71 | 1131 | 199 | **0** | **22** (solo partido en juego, banquillo, previas y repetición) |
| h0 | 88 | – | – | – | 0 | 1 | 0 | 0 |
| **h1** | **106 (11)** | 0 | 0 | 11 | 0 | 0 | 0 | 0 |
| pcbase / **pc1** | 647 / 689 (11) | 0 | – / 16 | – / 320 | 2021 / 2004 | 1211 / 1211 | 48 / 48 | 0 |

(Sumas de los 3 tamaños. pc1 se pasó antes del último ajuste del recorte `o`, el de las filas que se desplazan de lado: sus `o` son de la regla
anterior; no cambia la comparación con `pcbase`, que se hace sin los `o`.)

- H igual: las diferencias h0 → h1 son del arnés (lesión que ya no se hereda: el hub sano enseña «Jugar» + informe y la línea de la Selección,
  +7 recortes en carrera-*-match / natl-tarjeta / cesion-aviso / cesiones / estrellas-finde) y de las métricas nuevas (11 `o`, 11 pisados).
- PC: frente a `pcbase` solo cambian las filas conocidas (inbox y league-clubs del arnés, dbgSets de carrera-juvenil-hoja y
  carrera-estrellas-partido-hoja, ruido de controles-keyboard y final-stats) y las de la Carrera que antes salían lesionadas por la fila
  anterior (carrera-*-match a 1024, natl-tarjeta, cesion-aviso, propuesta-puesto, player-train, club-contract/team/offers, estrellas-finde,
  cesiones, plan): mirado a ojo (propuesta-puesto 1280, match 1024: lo único distinto es «De baja» frente a «Jugar»). partido-frenar-* a
  1024x768 «no se pudo abrir», igual que en `pcbase`.
- Nuevos `o` y pisados de H para `recortes`: «Caducan al jugar» (cesiones 568), «Prenda» (life-pass), «Peloteo libre» (entreno), «Errores» del
  índice de estadística, «Set 3» (estadistica-6v6), «Abrir sala» (online-create), «Ver cómo se juega» (primer-partido); pisados «Eres colocador»
  / «Coloca con la diana» (aviso del colocador), «Ataque»/«Bloqueo»/«Saque» (final-stats y carrera-resumen-stats a 568), «24 puntos» / «Nota 7,8»
  (resumen de jornada 568). Ojo: algunos `o` en parches («Crear jugador» de crear en vertical) pueden ser el brochazo girado: mirar antes.

**30 peores filas de v1** (peor tamaño; recort = no permitidos): online-list y online-aviso (360: recort 3, < 12 21) · entreno (360: recort 8,
< 12 11) · final-primero (360: recort 7, < 12 12) · final-stats (360: < 12 17) · carrera-pista-league-table (412: < 44 12) ·
carrera-playa-league-table (390: < 44 10) · carrera-natl-partido-hoja (360: < 12 12, pis 2) · perfil-entreno, -carrera, -cuaderno-pie,
-vestuario, -insignias, -retos, -hitos, -cuaderno (360: < 12 12-13) · carrera-resumen-stats (360: < 12 15) · carrera-pista-inbox (412: recort 9) ·
carrera-natl-partido-hoja-derrota (360: < 12 11) · carrera-playa-inbox (412: recort 8) · carrera-playa-league-cal (360: recort 6, pis 3) ·
home-seguir-carrera, home-carrera, home-seguir (360: recort 3, < 12 6-7) · carrera-hoja-final, carrera-resumen-jornada, final-reto (360: < 12 10) ·
quick-6v6 (360: recort 3) · controles-touch-editor-zurdos (412: recort 4; debe pedir girar, paneles-v) · carrera-playa-honors-titles (412: < 12 11).

**Pantallas de este paquete, V antes → después** (recortes sumados en los 3 tamaños): carrera-*-match 5-6 → 0-2 y sin aviso de girar; league-cal
35 → 8; propuesta-puesto 7 → 0 (< 12 7 → 0); natl-tarjeta 6 → 0; estrellas-voto 4-5 → 0-2 y «principal NO» 3 → 0; cesiones y honors-stats 2-3 →
0-2 (la columna Nota se ve: columnas del móvil con `tbl` = mob); opiniones-sug y pausa-bug < 12 6 → 0 (sin atajos). Igual (sin maquetar, para
su paquete): inbox (23: vistas previas → `cutWords` en carrera-liga-vida-v), home-carrera, hojas finales, final-stats (< 12 17-24), cuenta-crear,
instalar-ios (`.pv-sheet` en paneles-v / menus-v). La Carrera en vertical sale con la cabecera de PC + 5 pestañas de icono arriba + `#crDock`
abajo (contenido de `.ph` con CSS de PC): la maqueta carrera-marco-v. Algunas pantallas de la Carrera pasan de 0 a 3 «< 12» en vertical (cosas
de `.ph` que en vertical aún no tienen su CSS): para carrera-marco-v.

**Pendiente** (para los paquetes siguientes): la Carrera vertical entera (cabecera, `.pv-tabbar`, `.pv-dock`, decisión arriba: la propuesta de
puesto queda bajo la Selección); las vistas previas de la Bandeja con `cutWords` + `data-trunc="preview"`; cuenta / instalar / aviso del colocador
como `.pv-sheet` (el aviso ya la recibe vía `SP.modal`, pero su CSS de `#setNote` manda en ancho/fondo); «< 12» de las hojas finales y Perfil en
vertical; 3 «salida NO» de carrera-banquillo en vertical (la pausa queda bajo el velo: lo esperado, partido-v); el subtítulo de JUGAR en vertical
(`subOn` con phone: menus-v decide el texto corto).

#### 8.6.2 Paquete recortes (24-nov-2026)

Horizontal (html.ph): todos los recortes y la información que quitó la ronda 1. Lo que cambia QUÉ SE DICE va con `mob()` (vale también en
vertical); la maqueta vertical es de los paquetes de zona. CSS nuevo en el bloque «RONDA 2 · paquete recortes» al final del `<style>` de
`index.html` (prefijo `:root.ph` + 5 `:not(#_)`; `:root:is(.ph,.pv)` si es contenido) y en los `PQ`/`PP` de cada módulo. PC sin cambios.

**Hecho**
- *Ayudas enteras*: Ajustes (`.opt>small` sin clamp ni «…», 2-3 líneas, control en su columna); Controles › Mando/Teclado en 2 líneas;
  Táctil y pausa con la ayuda ENTERA (`renderCtl` ya no corta en el primer «;»: Colocar vuelve a decir «en el 3r toque, golpe colocado; en el
  suelo, tu colocación va con Golpear»), las largas (> 40 car., `.ctl-w`) a todo el ancho, rejilla `dense`. La «i» de `.sp-info`, dibujada en SVG.
- *Selección* (`career-natl.js card`, móvil): rótulo en su línea y debajo «Grupo B | J2 | ESP–ROU | Fuerza 62-53» (separadores `sp`, la fuerza
  en `.nw`; «Clasificación» no se repite); `.ph-dec` en dos filas (rótulo a todo el ancho, datos que parten + botón).
- *Faro* (`career-world-ui.js lineHTML`): en el móvil, la primera oración entera + «Ver más»; al tocar (`.ph-open`) la frase completa. Sin clamp.
- *Bandeja*: vista previa con `SP.cutWords(…, 64)` y `data-trunc="preview"`, 2 líneas.
- *Contrato*: `ROLE_SHORT` / `ROLE_SHORT6` (career.js, cifras de `BENCH`/`PROMOTE_AT`/`TIT_BROKEN`/`ROLE_FLOOR`) en el móvil; la larga, tras el «?».
- *Cesiones*: nombre corto + el largo debajo (`.ln-ol`), datos en 2 líneas, condiciones con wrap, «Ir cedido» debajo a la derecha a 568;
  cedido: «Vuelves a Voley Sanroqueño». *Club › Ficha*: patrocinador / «★★ · Hiperliga 2» en 2 líneas.
- *Crear*: «Una temporada con tu instituto» (móvil) y los subtítulos de Rol hasta 2 líneas. *Noticias*: titular entero. *Vitrina*: nombres de
  trofeo enteros (también los huecos vacíos); a 568 la categoría encima de su fila. *Estrellas*: «Marca a batir…» entera.
- *MVP* de las hojas: nombre entero arriba y TODAS las cifras en fichas con wrap (la Carrera ya no esconde ataque/bloqueo/aces); en la Carrera,
  rejilla [dorsal | nombre | nota] / [fichas] y el MVP justo tras el progreso (primera pantalla). Situación de la semana y reto (844+): vuelve el
  MVP al resumen. Primer partido a 568: «Y ahora» al final. Cifras: cabeceras «Ata.» «Bloq.» «Saq.» en el móvil (no se pisan).
- *Vuelve lo quitado*: Jugadores (tira «50 MEDIA · NIVEL 1 · 0/120 XP · PUNTOS 0» de 36, «Nv 1 · Media 50», descripción del atributo en 2.ª
  línea); Maestría («Aces en un partido» / «récord 0 · bronce 2», `rtWhatPh`); Crear cuenta a 568 (aviso del usuario sin @ + «Ahora no» como
  enlace); «Compartir» / «El grupo»; pestaña «Cifras» en las dos orientaciones; «Rival» / «Tu club» en Clubes; «Ver baja» (no «✚ Baja»);
  online: salas llenas legibles con «Llena» / «Otra versión», «Igualado» de vuelta, fichas con fondo que parten (sin «·» huérfano), el nombre
  y la sede enteros en «Así sale en la lista» (fuera VS y el hueco); aviso del colocador sin la sombra que tachaba «remate».
- *Otros*: Perfil a 568 en 3 columnas (nombres hasta 3 líneas); parches con título y subtítulo 8 px más altos (Ver cómo se juega, Peloteo
  libre, Abrir sala); estadística con desvanecido en sets e índice; fin de cesión antes de la Gala; el «?» del plan junto a su ✕.
- *Arnés*: `mobaudit --probe 'JS'` (evalúa tras abrir cada pantalla); el recorte `o` ya no cuenta lo que se sale de lado en una fila que se
  desplaza CON desvanecido o máscara (se alcanza desplazando).

**Métricas** (`…/movil2/r2-recortes/`: `hfull` = pasada H completa 241 pantallas, `v` = vertical de los 75 ids, `pc` = PC de los 75 ids)

| pasada | recortes no permitidos (o) | permitidos | tapado-pie | pisados | < 12 | < 44 |
|---|---|---|---|---|---|---|
| h1 → **hfull** (241, H) | 106 (11) → **0 (0)** | 0 → 0 | 0 → 0 | 11 → **0** | 0 → 0 | 0 → 2* |
| v1 → **v** (75 ids, V) | 220 (10) → 177 (10) | 0 → 43 | 0 → 0 | 50 → 50 | 674 → 668 | 45 → 45 |
| pc1 → **pc** (75 ids) | sin cambios de maqueta: 6 filas con ±1-2 en «< 14» / «juntos» = el 3D de fondo (mirado a ojo: Ajustes, Jugadores, Cifras iguales) |

\* quick-6v6 568/915: la flecha «Más difícil» (44×44) sale como < 44 según el valor elegido en la fila anterior; no lo toca este paquete.

**Pruebas** (primer plano): csscheck, settest (86), touchtest (34), touchedittest (52), padtest (54), retotest (87), semanatest (66),
statstest (1172), recaptest (312), careertest, storymsgtest, storyuitest, natltest (180), loantest, worldtest, lifetest, roomtest (95),
synctest (55), proftest (96), consignatest (99), ambientetest (124), a11ymarktest (28), girotest (21): todas OK.

**Pendiente**
- V (de los paquetes de zona): carrera-crear-juvenil 360 (dificultades a < 8 del ‹), carrera-playa-club-contract 360 («Pedir el traspaso»
  bajo la barra), pisado transitorio del aviso del Perfil sobre el pie a 360. Los 177 recortes verticales restantes son de maqueta vertical.
- carrera-pista-honors-stats a 568: el contador «2/31» de la tira sigue a la izquierda (la sub-pestaña activa ya se ve entera).
- Ajustes › Ambiente con el selector debajo cuando el panel < 600: a 568 cabe en su columna con la ayuda en 2 líneas; no hizo falta.

#### 8.6.3 Paquete carrera-marco-v (24-nov-2026)

Marco de la Carrera en vertical (html.pv) y hub del Partido. PC: todo bajo `:root.pv` y JS tras `VERT()`; pasada de PC de las 133 `carrera-*`
(1280x720 y 1024x768) idéntica a `pc1` (una sola diferencia de 1 «toque junto», ruido). Horizontal sin cambios de código (las diferencias con
`r2-recortes/hfull` son de la muestra: Faro en vez de la Selección en el hub).

**Nombres exactos (para carrera-jugador-club-v, carrera-liga-vida-v y carrera-flujo-v)**
- `js/career-ui.js`: `VERT()` = html.pv (DÓNDE VA en vertical; `PV` es el prefijo CSS `:root.pv` + 3 ids). `PW` = `:root.pv` + **4** `:not(#_)` +
  `#career`: el prefijo del marco y de todo arreglo vertical (gana a la copia).
- **Copia del contenido del móvil** (`pvClone()`, `<style id="careerPvCopy">`, al final del `<head>`): cada regla `:root.ph … #career` de
  TODAS las hojas (career-ui, extensiones, las que se inyectan tarde) se copia como `:root.pv.pv …` (una clase más: gana a PC y a `:root:not(.ph)`),
  sin las del marco (`PV_SKIP`: `.cr-in/.cr-head/.cr-tabs/.cr-sub/.cr-dock/.cr-mail/.cr-title/.cr-ovr/.cr-hcr`, `#crTabs/#crSub/#crDock`, la raíz
  `#career`) ni las `.ph-s`/`.ph-w`; en la copia, `text-overflow:ellipsis` → `clip`, su `nowrap` → `normal` y `-webkit-line-clamp` → `unset`
  (regla sin recortes; salvo selectores con `data-trunc`). Las variables de componentes SPLAT de index.html (`:root.ph … .sp-btn{…}`) se copian
  como `:root.pv:not(#_):not(#_) #career …` (mismo peso). Las `--ph-*` valen en `#career` vertical con valores fijos (PV_CSS, cabeza del bloque).
  → En los paquetes siguientes: lo que en vertical deba ser distinto de horizontal, con `PW`; lo de contenido común, en `PQ` y llega solo.
- **Cabecera** (`renderInner`, con `VERT()`): `.cr-head` en flex que parte: `‹` (`.sp-back`, redondo 44, aria «Volver al menú») · retrato 40
  (`.pt.cr-pt`) · escudo (`.cr-hcr`) · … · sobre `.cr-mail` (44, globo) · sello `.cr-ovr` 44; debajo `.cr-title` con `<b>` nombre (1 línea) y
  `<small>` «T1 · Liga · club corto» (parte por palabras). Sin retrato (a medias, crear, prueba), el título va en la fila del ‹. Alto 112 → ~104.
  Juvenil (career-prologue.js): antetítulo «J3 de 5» y la liga de título; prueba: «Prueba» + nombre.
- **Barra de apartados** `#crTabs.pv-tbar` (ui.js `fitTabs` con `data-ph-tabs="rail"` en vertical; nunca solo-icono): fila de rejilla abajo
  (área `tb`), 5 apartados de horizontal con icono 24 + rótulo 12, mancha amarilla detrás del icono, `.dot`, `padding-bottom: --pv-gb`.
  `data-ph-tabs="strip"` en vertical = `.pv-tstrip` (ofertas, extensiones con pestañas propias: arriba, área `sb`).
- **Tira** `#crSub` (área `sb`): fondo `--sp-ink` opaco a todo el ancho, `.cr-ml`/`.cr-mr` (desvanecido 20-44 + chevrón dorado de 26) con la
  activa centrada (`phStrip`, `fitTabs`); con ≤ 4 que caben, `.cr-seg` (segmentado). Tercer nivel: el componente que ya existe `lgPick()` →
  `.cr-lgp` («‹ España · Hiperliga 2 ›», el valor abre la hoja `lgsheet`); en vertical se ve con la copia.
- **Rejilla** `.cr-in`: filas `hd / sb / bd / dk / tb` (`#career` sin padding lateral; cada zona lleva `--pv-g`). Cuerpo `.cr-body` con 22 arriba
  (los sellos asoman). **Dock** `#crDock` (área `dk`, encima de la barra): principal `flex:3`, secundarios `flex:2` (`--sp-px:8px`), texto en 2
  líneas sin cortar palabras; una sola acción a todo el ancho. Las decisiones (`phDecide`) siguen llevando su par al dock.
- **Faro plegado** (`pvAfter()` → `.cw-mentor.cw-fold` + botón `.cw-pv` «Ver»): tira de una línea [cara][título][Ver] detrás de la franja de
  decisión o del ticket; tocarla abre `pvMentor()` = `VB.Splat.sheet` con quién, la frase entera y los botones de la escena (pulsan los de la tarjeta).
- **Ticket** (`phKick` con `VERT()`): dos fichas `.pv-kc` («J5/14 · Sets a 21» / «8º · IA Fácil») dentro del padding; rejilla `k / s x / t`:
  escudos + Informe (la ficha baja debajo si no cabe) y el rival a todo el ancho en una línea («en Voley Socuellamino»).
- Otros: pastillas `.st-chips` enteras (hasta 3 líneas, 48); secundarios del cuerpo (Jugar/Simular con decisión, Mirar, Ver los 6) de 48 en
  fila de 2; Estrellas › fin de semana apilado; lesión con Volver antes / Fisio de 56 y la letra pequeña entera; `.fact` clave/valor por línea;
  atributos en una columna; «?» de la propuesta fuera del texto; a medias con «Regional · J5/14», centrada y «Seguir el partido» a todo el ancho;
  aviso del colocador (index.html): «No mostrar más» como enlace, «Más» separado de Activar.
- **Arnés**: `pest` acepta la tira vertical (`.pv-tstrip` con `.cr-ml/.cr-mr`); lo que está bajo `[inert]` (detrás de una hoja vertical) ya no
  cuenta como objetivo (solapes y tapados falsos). `girotest` +6: barra abajo con Liga elegida, tira y cabecera ≤ 120, giro 390x844 ↔ 844x390
  que conserva Liga › Jornadas, la copia presente.

**Métricas** (`…/movil2/r2-marco/`: `v` = vertical de las 133 `carrera-*`, 3 tamaños, DPR 2; `pc`; `h` = H de 31 ids)

| pasada | recortes no perm. | < 12 | < 44 | solapes | tapados | pisados | girar |
|---|---|---|---|---|---|---|---|
| v1 → **v** (toda la Carrera) | 227 → **128** | 570 → **184** | 70 → **32** | 25 → 12 | 134 → 12 | 36 → 40 | 0 fuera del partido (banquillo y previas: «girar (partido)») |
| ids del paquete (22 × 3) | 21 → **0** | 44 → **0** | 0 | 0 | – | 0 | 0; principal SÍ en todas; tapado-pie 0 |

Cabecera, barra y tira: 0 recortes en toda la Carrera vertical; sin desplazamiento lateral nuevo (fuera 3 = 3). Pruebas: csscheck, careertest,
storytest, storyuitest, storymsgtest (113), storyweektest (86), storyseasontest (83), storywalltest (88), worldtest (155), lifetest (110),
natltest (180), injurytest (146), loantest (188), allstartest (210), racetest (2485), devtest (237), prologuetest (1807), a11ymarktest (28),
girotest (26): todas OK.

**Pendiente** (para los paquetes de zona): los 128 recortes que quedan en vertical son de ofertas (chips, «3 temporadas», nombre), premios-datos /
league-race (club pequeño con «…»), hojas finales (#end: fichas «8 × Remate ganado», < 12), previas (ROC/SOL), natl-clasif (tabla), league-cal,
crear (parche «Crear jugador» `o`), ficha/rencor de club (chips `o`), look («En playa · Tupé»); < 44 en honors-opts (7-8) y crear-juvenil (3);
`< 14` sube (rótulos de 12-13 de la barra, fichas y tira: dentro de lo permitido). Lesión: el sello «De baja ◆ Esguince…» sigue en 2 líneas
(no cabe en una con el «?»; la franja de 1 línea queda para carrera-jugador-club-v). Faro en hoja: «Seguir» de una escena de varias frases
cierra la hoja (hay que volver a tocar «Ver»).

#### 8.6.4 Paquete carrera-jugador-club-v (24-nov-2026)

Jugador, Club, selección, cesiones, traspasos y plan en vertical (html.pv). Todo en el bloque «carrera-jugador-club-v» al final de `PV_CSS`
(`js/career-ui.js`, prefijo `PW`; con `#crBody` cuando la copia de .ph lo lleva) y dos toques de JS tras `VERT()`. PC y horizontal sin cambios.

**Hecho**
- *Componentes de .ph que la copia no traía* (están en index.html sin `#career`): `.ph-kv` en UNA columna (rótulo 12 en mayúsculas a la
  izquierda, valor 14 a la derecha que parte en 2 líneas; antes salía «ObjetivoQuedar…», «RolRotación» pegados), `.ph-grid2` (1 columna; 2 desde
  385 px), `.ph-dup` fuera. Arregla Club › Ficha, Contrato, traspaso-renovar/-no, cedido y todo lo que use esas clases en la Carrera vertical.
- *«?» y sellos*: el sello de una tarjeta con «?» deja 56 px a la derecha (no pasa por debajo del círculo); el «?» que iba DENTRO del título
  (Estado físico, Cómo entrar de la Selección) sale a la esquina de su tarjeta (`pvAfter`: `.card>h3:first-child>.cr-q` → hijo de la tarjeta, `.cr-qo`).
- *Firma*: tarjetas a todo el ancho (2 desde 390), nombre y dato sin cortar; «Gesto antes de sacar» en su línea y rejilla 2×2 de 48 (fuera
  «NINGU…» / «TRES BOTES» apretado). *Insignias*: UNA columna también a 390-412 (en dos, la descripción partía en 4-5 líneas de dos palabras),
  «Cañón · Bloqueada» / descripción / barra / cifra, sin «|» (el separador es un salto de línea).
- *Estado*: Plan y Puesto (`career-dev.js`, tarjeta flex) con sello · «?» (· ✕ si la lista está abierta) en la fila del título; «Elegir plan» /
  «Pedir cambio» bajan a su fila bajo el texto, 48 de alto; con la lista abierta el sello parte en 2 y la ✕ va junto al «?» (antes, sola en una fila).
- *Ropa*: «Vestuario ›» al dock (`renderLook` marca el `.acts` con `data-ph-dock` en vertical); fila colores · «67/155 · 2 nuevos» / «En playa ·
  Tupé» · «?» (antes la cifra partía letra a letra).
- *Compañero / Plantilla*: «Elegir» arriba a la derecha junto al nombre, fichas y frase a todo el ancho debajo; el primer jugador baja 26 px
  para no quedar bajo el «?».
- *Contrato / traspaso*: tira de la renovación con letra 15 / rótulo 12 que parte; la decisión ya iba arriba y Firmar / Prefiero salir (Aceptarlo /
  Insistir) en el dock (carrera-marco-v).
- *Cesiones*: escudo + nombre corto (y el largo debajo), datos en líneas, «Pareja Óscar, 32» como ficha sin partir y «Ir cedido» debajo a la
  derecha (150 px). *Cedido*: el nombre empieza bajo el «?».
- *Ficha / rencor de club* (Liga › Clubes): rejilla [‹ 44][escudo 48][nombre + «liga · año · apodo»][1r · 9 pts]; franja de rencor entera;
  fichas que parten («Cala Fonda de Miraflor» ya no se corta). No es una `.pv-sheet`: se queda en el cuerpo con la barra y la tira (volver = ‹).
- *Selección*: franja [bandera 36][ESPAÑA][Titular] … [?] y «Confianza 62» debajo; tabla de la clasificación con «1r partido: ESP – SRB» entero
  (columnas de cifras a 1 %); cabeceras a 12; el bocadillo «Simular el resto» ya no pisa la línea de debajo.
- *Vitrina* (palmarés de la selección; vale también para Vida › Vitrina): la categoría encima de su fila y los trofeos en 2 columnas (3 desde 385).

**Métricas** (`…/movil2/r2-jugclub/`: `v` = 39 ids × 360/390/412, DPR 2; `h` = 39 × 568/844/915; `pc` = 39 × 1280/1024)

| pasada | recortes no perm. (o) | < 12 | < 44 | solapes | tapado-pie | pisados | principal NO | despl. lateral |
|---|---|---|---|---|---|---|---|---|
| r2-marco/v → **v** | 16 (8) → **0 (0)** | 0 → 0 | 0 → 0 | 6 → **0** | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| r2-recortes/hfull → **h** | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | igual (sin diferencias por pantalla) |
| r2-marco/pc → **pc** | sin diferencias por pantalla (frente a `pcbase`, solo las conocidas de §8.6.1: Estado/plan/contrato/cesiones sin la lesión heredada); a ojo, igual |

`< 14` sube en V (rótulos de 12-13 de `.ph-kv`, dentro de lo permitido); «toques juntos» 615 → 569.

**Pruebas** (primer plano): csscheck, careertest, devtest (237), injurytest (146), loantest (188), natltest (180), worldtest (155), badgetest (53),
storyuitest, girotest (26): todas OK.

**Pendiente**
- carrera-*-lesion (no estaba en la lista del paquete): el sello «De baja ◆ Esguince…» sigue en 2 líneas.
- La ficha de club no es hoja a pantalla completa (decisión: se queda en el cuerpo, con ‹; más simple y sin perder la tira de Liga).
- Firma: la descripción breve en la tarjeta no se añadió (está en la hoja al tocar, como en horizontal). El gesto: las manchas `.seg` dejan
  algo de aire vertical entre filas (el dibujo es más bajo que el objetivo de 48).
- Estado sigue siendo largo (lesión, plan, puesto, ánimo, plan del entrenador, progreso): «Elegir plan» se ve en la primera pantalla a 360.

#### 8.6.5 Paquete carrera-liga-vida-v (24-nov-2026)

Mensajes, Liga, Vida, Palmarés, premios y Vitrina de Estrellas en vertical (html.pv). CSS en `PV_LV()` (`js/career-ui.js`, tras el bloque de
carrera-jugador-club-v; prefijo `PW`, `W(cv)` = `PW #crBody[data-cv…]`). Lo que cambia QUÉ SE DICE va con `PH()`/`H.ph()` (= mob, vale también en
horizontal). PC sin cambios.

**Hecho**
- *Redes*: los 3 tonos en fila de 64 sin tope de alto; efectos como fichas con el triángulo pegado (` ` antes de ▲/▼ en el móvil:
  «Entrenador ▼», nunca «▼ Fama»); publicaciones a 15. *Bandeja*: ya estaba (segmentado Bandeja 4 · Redes, vista previa por palabra); avatar 40.
- *Tabla*: `table-layout:fixed`, columnas de cifras de 28 (Pts 34), «#» 30; escudo 24 siempre a la izquierda y el nombre hasta 2 líneas por
  palabras (antes «Voley Alcobendense» bajaba debajo del escudo); la cabecera pegada a `top:-22px` (no asoma media fila por encima) y el rótulo de
  la tabla por encima de su sombra. Pie «Puntos: 3 por ganar 2-0…» con los marcadores sin partir (`PTS_LINE()`, antes «1-» / «2.»).
- *Jornadas*: el rival entero (nombre corto, 2 líneas si hace falta; fuera el `nowrap`/elipsis en línea con `!important`), «Próximo» como ficha
  oscura, Jefe a 12, filas sin resultado al 82 %.
- *Noticias* (`career-world-ui.js newsT`): en el móvil los clubes de la noticia con `shortClub` («Voley Lucus se sube al liderato…», el largo
  sigue en el aria-label y en la ficha) y los marcadores en `.nw`; titular a 15, «T1 J4» a 12. Vale también en horizontal.
- *Clubes / selector de liga*: «‹ España · Hiperliga 2 ›» con `text-wrap:balance` y letra clamp(15-18) («España · / Hiperliga 2 · 12», nunca
  «Hiperliga / 2 · 12»); filas de 52. Ordinales: se queda la forma de la guía (1r, 2º, 3r, 4º…; memoria «ordinales»): la lista y la ficha usan la
  misma función.
- *Premios / Datos*: pestañas en rejilla 3+2 con el rótulo entero (antes «PUESTOSAQUE»); fila [puesto 34 con la flecha debajo][nombre 16 + club 13
  en 2.ª línea, sin elipsis][nota].
- *Vitrina* (Palmarés y Estrellas): 3 columnas también a 360 (gap 12/10), nombre entero en 2 líneas.
- *Temporadas*: los totales de la carrera, uno por línea (`p.cr-tot`, sin «|» sueltos).
- *Ajustes*: rótulo + «?» arriba, el selector a todo el ancho (Dificultad en 2×2, Cuánta vida en 3, Lesiones en 2; antes «FÁCI NOR DIFÍCEXPEI»),
  la frase de la elegida entera debajo; «Crear Carrera de pista» con «6 contra 6» de subtítulo (móvil; en PC el texto de siempre).
- *Cifras*: cada temporada como tarjeta («T1 Voley Sanroqueño» arriba; Puesto · PJ · PG · Puntos · Nota con el rótulo debajo, alineados abajo);
  «Ver tabla completa» a todo el ancho debajo (antes tapaba «Por temporada»).
- *Fama*: celebraciones con la ficha de fama debajo si no cabe (antes «Se / desbloquea / con la fama»); la primera baja bajo el «?».
- *Tienda*: nombre en letra de cuerpo 15 (no versalitas en 3 líneas), «Nv 0/3» como ficha, precio de 44 × 88.
- *Logros* (`career-life-ui.js`: `.lf-gn` / `.lf-gr`): tarjeta de 3 líneas a todo el ancho (título + premio a la derecha / descripción / barra +
  «1/5»); en horizontal se ve igual que antes.
- *Camino*: rejilla de niveles de 5 columnas con casillas de 56 (antes tira lateral).

**Métricas** (`…/movil2/r2-ligavida/`: `v` = 37 ids × 360/390/412, DPR 2; `h` = × 568/844/915; `pc` = × 1280/1024)

| pasada | recortes no perm. | < 12 | < 44 | solapes | tapado-pie | pisados | toques juntos | despl. lateral |
|---|---|---|---|---|---|---|---|---|
| r2-marco/v → **v** | 35 → **0** | 0 → 0 | 26 → **0** | 0 → 0 | 0 → 0 | 13 → **0** | 765 → 720 | 0 → 0 |
| r2-recortes/hfull → **h** | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 264 → 262 | igual |
| pcbase → **pc** | solo las conocidas (inbox y league-clubs, arnés); frente a r2-marco/pc todo igual salvo +29 caracteres de inbox (mensaje del Club distinto en la muestra; a ojo, igual) |

`tapados` V 2 → 4: filas que quedan a medias bajo la barra o la cabecera pegada según el desplazamiento (tabla a 360-412, Ajustes a 390). En H,
`< 14` sube en Logros por partir «1/5 · +1 pts» en dos `span` (mismo aspecto).

**Pruebas** (primer plano): csscheck, careertest (2248), storymsgtest (113), storywalltest (88), storyuitest (145), storyseasontest (83),
worldtest (155), lifetest (110), racetest (2485), allstartest (210), girotest (26): todas OK.

**Pendiente**
- Premios: la edad («22 años») no está en la fila (el dato no llega a `rowPh`); el segmentado ocupa 2 filas.
- Cifras: «En toda tu carrera» sigue en una fila de 4 (cabe a 360 sin cortar); Temporadas no se ha fundido con Cifras.
- Horizontal: los totales de Temporadas a 568 siguen con algún «|» al principio de línea (no tocado: el paquete es vertical).
- Fama: queda aire entre el sello «Celebración» y la primera fila (el «?» va encima).

#### 8.6.6 Paquete carrera-flujo-v (24-nov-2026)

Crear jugador, ofertas, juvenil, prueba y hojas de partido de la Carrera en vertical (html.pv). CSS de `#career` en `PV_FL()` (`js/career-ui.js`, tras
`PV_LV`; prefijo `PW`) y de las hojas (`#end.crs`, `#gymEnd` de la Carrera = `#gymEnd:has(#btnGeList[data-cr])`, hojas `#spSheets`) en el bloque
«RONDA 2 · paquete carrera-flujo-v» al final del `<style>` de `index.html` (`:root.pv` + 5 `:not(#_)`). JS tras `VERT()` / `pvOn()` / `phPv()`.
PC y horizontal sin cambios (salvo el dato de la muestra de Estrellas, abajo).

**Hecho**
- *Crear* (`renderCreate`/`renderCreate6`): sin el `small` de la cabecera en vertical; Playa 2v2 | Pista 6v6 (`phModeSeg`) a todo el ancho bajo el
  título (fuera la tarjeta «Carrera» del cuerpo). Rejilla `[Nombre][Dorsal −/+]` / Dificultad en 4 (la frase entera debajo) / País / Puntos por
  set (rótulo + 15·21·25 en su fila) / Inicio / Rol o Puesto en 2 columnas / explicación plegada (`pvFlow`: vista previa por palabra
  `SP.cutWords` con `data-trunc="preview"` + «Ver más», acción `cf-more`, el texto entero al tocar) / reglas / aspecto. Barra: «Falta: tu
  nombre» en su línea y el parche a todo el ancho de 64 («Crear jugador» + «Y empezar el juvenil» enteros; antes «CREAR JUGADOR / Y empezar el»
  cortado por el `max-width:62vw` de la copia de .ph).
- *Ofertas* (`pvFlow` tras `phFlow`): escudo 40 + nombre corto a 22 en hasta 2 líneas + nombre oficial pequeño (`.of-on`, el `title` con
  patrocinador) + estrellas; «1/4» arriba a la derecha; cifras en rejilla 2×2; Rencor/Cariño pasa a las fichas (no pisa el nombre), fichas
  enteras que parten y la «i» con la ficha completa (hoja: clave encima del valor, antes «PuestoReceptor»); duración en 3 casillas de 56 con la
  cifra grande y «temporada(s)» (antes «3 te» cortado). Tira de clubes con desvanecido y chevrón dorado. Barra [Pedir más rol][Firmar].
- *Juvenil* (`career-prologue.js`): «Ir directo a las pruebas» fantasma pequeño en la fila del ‹ (como en H; abajo Siguiente a todo el ancho);
  tu ficha y la del rival con los datos en su línea (`spv`: datos `nowrap` en `.pv-sq`, el «|» va delante de cada dato y `pvSq` lo oculta en el
  que empieza línea); las tres formas de ser, una por fila con su frase entera. Temporada: el partido apilado (J3 a la izquierda, un equipo por
  línea con su escudo, «vs» solo para el lector). Equipo y chat ya iban (lista de 1 columna con ▾; cabecera del marco). Informe: [círculo 74]
  «Promesa» [?] en una fila (el «?» sale de la cabecera) y debajo «7,3 · 8/10 · 4/5»; la frase entera; Ver ofertas en la barra.
- *Prueba previa*: objetivos en fichas que parten (antes «2 recepciones perfectas» y «≤ 2 errores» cortados a 360). El resto ya iba (marco).
- *Hojas de partido* (`#end.crs`): hoja a pantalla completa [antetítulo corto + ojo redondo de 44 a la derecha] / título 28-36 en 2 líneas /
  marcador + sets / panel que se desplaza / barra [Menú principal 1/3 fantasma][principal 2/3, 2 líneas]. Etiquetas encima de su contenido a 12;
  orden Progreso → premios → MVP → Tu partido → Clasificación → resto, la frase del punto final al pie. MVP: [dorsal] nombre entero · nota y las
  cifras en fichas que parten (`rcHTML` usa `rc-mch` también con `cs && phPv()`). Lo mejor / A mejorar: etiqueta encima y TODAS las fichas
  enteras (parten de línea; `fitChips` ya no esconde ninguna). Prueba / juvenil: [nota][veredicto] y debajo, a todo el ancho, el texto, los
  objetivos («≤ 2 errores») y Lo mejor / A mejorar. Cifras: «Puntos» arriba, MVP, el resto de barras y «Estadística del partido» como enlace al
  pie (fuera el bocadillo de arriba); rótulos a 12. Resumen de jornada: tu fila ±1 y «Ver tabla» (`endTableSheet`: la clasificación entera en
  una hoja; solo vertical). Estrellas: «Equipo Sol / 21-18 / Equipo Luna» apilado, «Tu nota 7,8 · MVP: tú», la recompensa en el recuadro dorado.
- *Concurso / sesión* (`#gymEnd`): título 32-40 en una línea, resultado que se desplaza, clasificación a todo el ancho; barra [Volver a la
  Carrera][Siguiente: …] (sesión: 128 px + parche) o, con tres botones (concurso), «2º intento» entero a todo el ancho y debajo [Volver][Siguiente].
- *Marcador de Estrellas*: en el juego de verdad la cabecera ya dice SOL / LUN (`setup` pone `career.me/rival = TEAMS[].k`); el TÚ / VAL era
  de la muestra (`debug=over&cr=1`). Arreglado en la muestra: `_endDemo` devuelve `cs` con los equipos (en PC solo cambia ese dato).
- *Arnés*: `mobaudit --preshot 'JS'` (se evalúa justo antes de la captura; la medida puede desplazar y la captura salía a media lista).

**Métricas** (`…/movil2/r2-flujo/`: `v` = 32 ids × 360/390/412, DPR 2; `h` = × 568/844/915; `pc` = × 1280/1024/1920, DPR 1)

| pasada | recortes no perm. (o) | < 12 | < 44 | solapes | tapado-pie | pisados | fuera | principal NO | girar |
|---|---|---|---|---|---|---|---|---|---|
| r2-marco/v → **v** | 65 (21) → **0 (0)** | 184 → **0** | 6 → **0** | 3 → 0 | 0 → 0 | 27 → **0** | 3 → 0 | 0 → 0 | 0 |
| r2-recortes/hfull → **h** | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | igual por pantalla (+3 caracteres: SOL/LUN) |
| pcbase → **pc** | solo las conocidas (dbgSets de juvenil-hoja y estrellas-partido-hoja; `o`/pisados nuevos = métricas que `pcbase` no tenía); frente a `r2-marco/pc` (1280/1024) idéntico salvo +2 caracteres (SOL/LUN); a ojo, igual |

Toques juntos V 42 → 40; caracteres V 38332 → 33754 (la explicación de crear plegada tras «Ver más», el `small` de la cabecera de crear, fichas
repetidas que ya no salen dos veces).

**Pruebas** (primer plano): csscheck, careertest (2248), prologuetest (1807), allstartest (210), natltest (180), recaptest (312), statstest
(1172), storytest (68), storyuitest (145), girotest (26): todas OK.

**Pendiente**
- «Ver tabla» en la muestra (`debug=over&cr=1`) sale con abreviaturas y PJ 0 (filas de muestra sin nombres ni partidos); en una Carrera de
  verdad lleva el nombre del club (`VB.Career.club`) y los partidos jugados.
- Hoja del juvenil: el panel queda con aire de sobra debajo (poco contenido); no se ha añadido nada.
- Si se gira el móvil con la hoja abierta, el MVP en fichas y «Ver tabla» (oculto fuera de .pv) se quedan como se pintaron hasta la siguiente hoja.
- «Siguiente: 3ª jornada» del Continental parte en 2 líneas en la barra (entero).
