# notes/splat.md — sistema de diseño SPLAT («materiales del vóley + toque Splatoon»)

Pedido de Ferran (17-nov-2026), tras ver el prototipo `?menu=jugador`: «Me gusta. Diseña todos así». Este documento es la guía para
rediseñar CUALQUIER pantalla con el mismo lenguaje sin reinventarlo: se AÑADEN clases `.sp-*` al marcado (y, si hace falta, una
llamada a `VB.Splat.decorate()`), no se escriben botones nuevos a mano.

- CSS: `index.html`, bloque **«SPLAT: SISTEMA DE DISEÑO»** (tokens y componentes), y debajo un bloque por pantalla ya hecha:
  **«SPLAT · PORTADA»** (`#menu.mj`), **«SPLAT · JUGAR»** (`#mpPlay`) y **«SPLAT · PARTIDO RÁPIDO»** (`#mpQuick`). Cada pantalla nueva
  añade SU bloque `SPLAT · <PANTALLA>` al final del `<style>` (así varias personas trabajan a la vez sin tocar el mismo trozo).
- JS: `js/splat.js` (`VB.Splat`), cargado justo después de `js/version.js`. La portada la compone `js/menu-jugador.js`.
- Ejemplos vivos: la portada, Jugar y Partido rápido (capturas al final).

## 1. Ideas que no se negocian

1. **El partido se ve.** Nada de velos, degradados oscuros a pantalla completa ni paneles grandes: los botones son pegatinas sobre
   la demo. El único contenedor con fondo es `.sp-panel`, y solo para páginas de lectura larga (Ajustes, Cómo se juega, Acerca de…).
2. **Cada cosa con su material.** Acción principal = parche cosido (`.sp-patch`); botones = manchas de pintura (`.sp-btn`); entrada de
   partido / Carrera = brochazo turquesa (`.sp-ticket`); reto y medallas = sello dorado (`.sp-stamp`); pestañas y elegidos = trazo de
   pincel (`.sp-tab`); etiquetas = pegatina pequeña (`.sp-chip`).
3. **Nunca una rejilla de tarjetas iguales.** Las manchas cambian de silueta e inclinación solas (semilla), y los colores se reparten:
   equipación, contraste, tinta, oro, turquesa. Si hay 3+ botones del mismo tipo, mezcla colores y tamaños.
4. **Textos en castellano** y con la guía de estilo de notes/ui_main.md («Textos: guía de estilo»: nada de «·» como pegamento, etc.).
5. **Toque ≥ 44 px** (los componentes ya lo cumplen: `min-height:44px`; las flechas de `.sp-select` son de 44×44).
6. **Mando y teclado**: todo lo pulsable es `<button>` dentro de un `[data-nav]`; el foco (`.kf` / `:focus-visible`) ya lo pinta el
   sistema (aro dorado + rebote). Para filas de varios botones en horizontal, el contenedor lleva `data-sp-row` (ver §5).
7. **Menos movimiento** (`#app.rm` o el del sistema): sin rebotes, salpicones ni empujones; ya está en el CSS y en `VB.Splat.reduced()`.

## 2. Tokens (en `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--sp-ink` / `--sp-ink2` | `#15102a` / `#2f2560` | tinta: contornos, sombras, relleno de las manchas de tinta / tinta clara (foco de filas) |
| `--sp-cream` / `--sp-cream2` | `#fff4dc` / `#fffaf0` | crema: texto sobre tinta, parche, pegatinas redondas |
| `--sp-gold` | `#ffcb3d` | oro: sello, foco, elegido, valores |
| `--sp-teal` / `--sp-teal-d` | `#1bb5a5` / `#0c7d75` | turquesa del balón: brochazo de Carrera |
| `--sp-danger` | `#ff4a5c` | acciones destructivas (borrar, abandonar) |
| `--sp-kit` `--sp-kit-d` `--sp-kit-ink` `--sp-kit-ts` | JS | color de TU equipación (Ajustes o el club de la Carrera), su versión oscura, el texto que va encima (tinta o crema) y su sombra |
| `--sp-alt` | JS | contraste de la equipación: lima con cálidas, rosa chicle con verdes, naranja con azules (texto siempre en tinta) |
| `--sp-line` / `--sp-sh` / `--sp-r` | `3px` / `3px 4px 0 tinta` / `clamp(10px,1.8vh,16px)` | grosor de contorno, sombra dura desplazada, radio del parche |
| `--sp-h-lg` `--sp-h-md` `--sp-h-sm` | alto de botón por tamaño | |
| `--sp-disp` / `--sp-pop` / `--sp-ui` | Bowlby One / Titan One / Rubik (con reservas del sistema) | acción principal / pegatinas y títulos / texto y cifras |
| `--sp-brush` | data URI | silueta de pincel (máscara) para pestañas y valores |
| `--sp-pad` `--sp-colw` `--sp-gap` | en `#menu` | margen, ancho de la columna y separación de las páginas |

Las fuentes vienen de Google Fonts (permitido por CONTRACT §2) en el mismo `<link>` que Barlow; el telón las espera como a las demás.

### Variables por componente (los retoques por pantalla se hacen con ELLAS, desde cualquier selector)
`--sp-c` relleno · `--sp-tc` texto · `--sp-d` gotas sueltas · `--sp-icc` icono · `--sp-ts` sombra del texto · `--sp-cf/--sp-tcf/--sp-icf`
lo mismo al enfocar · `--sp-h` alto mínimo · `--sp-fs` letra · `--sp-px/--sp-py` relleno · `--sp-tilt` inclinación · `--sp-is` tamaño del
icono · `--sp-ss` letra de `.sp-s` · `--sp-ph` alto del parche · `--sp-pt` letra del parche · `--sp-pr` hueco a la derecha del parche ·
`--sp-stamp` diámetro del sello · `--sp-cs` diámetro de `.sp-crest` · `--sp-aw` círculo de las flechas · `--sp-vs` letra del valor ·
`--sp-hs` letra de `.sp-h` · `--sp-tbh/--sp-tbs` alto y letra de pestañas · `--sp-chs` letra de `.sp-chip`.

### Por qué hay un prefijo raro (`:root:not(#_):not(#_):not(#_)`)
Las reglas de ESTRUCTURA de los componentes llevan ese prefijo: vale lo que 3 ids, así una clase `.sp-btn` puesta en un `.mi`, `.mode`
u `.opt` viejo gana a todas sus reglas antiguas (que llegan a 2 ids, p. ej. `#app #menu .mode`) sin borrarlas. Consecuencias:
- para cambiar tamaños y colores, usa las variables de arriba (sin prefijo, cualquier especificidad);
- si de verdad necesitas tocar una propiedad de estructura (display, padding, grid…) de un componente, pon el mismo prefijo delante
  de tu selector (`:root:not(#_):not(#_):not(#_) #miPantalla .sp-btn{…}`), como hacen los bloques de Jugar y Partido rápido.
- Los hijos viejos (`.mi-s`, `.md-art`, `.go`…) siguen con sus reglas: dales `.sp-s`, `.sp-t` o escóndelos en tu bloque.

## 3. Componentes (con ejemplo)

### `.sp-btn` — pegatina de pintura
Mancha con contorno de tinta gordo, sombra dura, goterón y gotas sueltas; rótulo Titan One un poco torcido; brillo de pegatina.
Al enfocar rebota (squash & stretch) con aro dorado; al pulsar se aplasta y salpica gotas de su color.
```html
<button class="sp-btn sp-md sp-kit" id="btnX"><span class="sp-ic">…svg…</span><span class="sp-l"><span class="sp-t">Jugadores</span><small class="sp-s">Nv 3</small></span></button>
```
- Tamaños: `.sp-lg` (54-84 px), `.sp-md` (46-66 px, por defecto), `.sp-sm` (44 px).
- Colores: `.sp-ink` (por defecto: tinta, texto crema, icono dorado; al enfocar se vuelve dorado), `.sp-kit` (equipación), `.sp-alt`
  (contraste), `.sp-gold`, `.sp-teal`, `.sp-danger`, `.sp-cream`.
- Silueta: familia por clase — media (por defecto, ~2:1), `.sp-wide` (~3:1, botones anchos), `.sp-sq` (cuadrada) o `data-sp-fam="mid|wide|sq|brush"`;
  semilla con `data-shape="n"` (si no, el puesto entre sus hermanos). Dos vecinos con distinta `data-shape` nunca se parecen.
- Extras: `.sp-noshine` (sin brillo), `.sp-calm` (foco con un rebote corto, para filas de lista), `.sp-dot` (punto rojo de «nuevo»),
  `.sp-quiet` (sin salpicón). `disabled` = gris y apagado.
- Contenido: `.sp-t` rótulo, `.sp-s` línea pequeña (Rubik), `.sp-l` columna de rótulo + línea, `.sp-ic` icono (SVG en `currentColor`; iconos de
  la casa en `VB.Splat.ICONS`: tut, ctl, set, play, back, trophy, cone), `.sp-crest` pegatina redonda crema (escudo, icono o «6v6»).

### `.sp-patch` — parche crema cosido (acción principal)
JUGAR, «Partido rápido», «¡A jugar!»; para lo que venga: «Jugar partido» de la Carrera, «Empezar» del Entrenamiento, «Revancha»…
Gajo del color de la equipación con el triángulo de jugar, costura discontinua, costuras de balón en relieve y labio de tinta que se
hunde al pulsar. **Uno por pantalla.**
```html
<button class="sp-patch" id="btnGo"><span class="sp-l"><span class="sp-t">¡A jugar!</span><small class="sp-s">Pabellón, Normal</small></span></button>
```
Alto con `--sp-ph` (por defecto `clamp(54px,12vh,104px)`), letra con `--sp-pt`. Con sello en la esquina: `.sp-pair` (abajo).

### `.sp-pair` — parche + sello
```html
<div class="sp-pair" data-sp-row>
  <button class="sp-patch" id="btnPlay">…</button>
  <button class="sp-stamp" id="btnReto" data-ring="RETO DEL DÍA ★ RETO DEL DÍA ★"><span class="sp-sc">…</span></button>
</div>
```
El sello se pega a la derecha, medio fuera; el parche deja hueco (`--sp-pr`). Lleva gotas de la equipación en la esquina (JS). El alto
del parche se pone en el `.sp-pair` (`--sp-ph`), el diámetro del sello también (`--sp-stamp`).

### `.sp-stamp` — sello dorado
```html
<button class="sp-stamp" data-ring="RETOS ★ RETO DEL DÍA ★" aria-label="Retos"><span class="sp-sc">…medalla o VB.Splat.BALL…<b>Hoy</b></span></button>
```
Texto del aro en `data-ring` (≈ 26-30 caracteres con las estrellas). Dentro, `.sp-sc` (centro oscuro con letra dorada;
`.sc-med.t1|t2|t3` = disco de bronce, plata u oro). `.sp-dot` = punto de «nuevo». Diámetro `--sp-stamp`.

### `.sp-ticket` — brochazo turquesa (entrada de partido / Carrera)
```html
<button class="sp-ticket" id="btnCareer"><span class="sp-tk">
  <span class="sp-tk-stub"><span class="sp-crest">…escudo…</span><i class="sp-vs">vs</i><span class="sp-crest">…</span></span>
  <span class="sp-tk-main"><small class="sp-k">Próximo partido</small><b class="sp-t">Rocaverde</b><small class="sp-s">T1 J3</small></span>
  <span class="sp-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span></span></button>
```
Otros colores con las mismas clases (`.sp-ticket.sp-gold`…). Alto con `--sp-h`, escudos con `--sp-cs`.

### `.sp-back` — Volver
```html
<button class="mp-back sp-back" data-shape="3" aria-label="Volver"><svg viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg><span>Volver</span></button>
```
Mancha de tinta pequeña (44 px), al enfocar dorada. En las páginas del menú va en la cabecera `.sp-head` (focusables de ui.js la pone la última).

### `.sp-h` y `.sp-k` — título y antetítulo
```html
<div class="mp-head sp-head"><button class="mp-back sp-back">…</button>
  <div class="mp-tt"><p class="kicker sp-k">Jugar</p><h2 class="mp-t sp-h">Partido rápido</h2></div></div>
```
Titan One crema con contorno de tinta y sombra, torcido −3°. Tamaño `--sp-hs`. En vertical parte en dos líneas.

### `.sp-tab`, `.sp-tabs`, `.sp-seg` — trazos de pincel
- Barra de `VB.UI.tabs(host, …)`: añade `sp-tabs` al anfitrión (`host.classList.add('sp-tabs')`) y sus `.tab` salen como trazos.
- Suelta: `<button class="sp-tab" role="tab" aria-selected="true">Hoy</button>`.
- Segmentado de Ajustes (`<span class="seg" data-seg="…">`): añade `sp-seg` → cada opción es un trazo; la elegida (`.on`), dorada.
Sin elegir: tinta translúcida con letra crema; elegida: trazo dorado con contorno de tinta; foco: aro crema y un poco más grande.

### `.sp-select` — valor con flechas
```html
<span class="mi-v sp-select"><span class="arr" data-d="-1">…</span><span class="mv-val"><b>Normal</b></span><span class="arr" data-d="1">…</span></span>
```
Flechas en pegatina crema redonda de 44×44 (`.end` = apagada), valor en trazo dorado. En Partido rápido las filas son `.sp-btn.sp-ink.sp-opt.sp-calm`
con la rejilla «flecha | rótulo + valor | flecha» (ver bloque «SPLAT · PARTIDO RÁPIDO»).

### `.sp-slider` y `.sp-toggle`
- `<span class="slider sp-slider" data-sl="…"><span class="trk"><i></i><b></b></span><span class="v">80%</span></span>`: pista de tinta,
  relleno del color de la equipación, mando crema con contorno.
- `<button class="sp-toggle" role="switch" aria-checked="true"></button>` (o `.on`): interruptor de tinta que se vuelve de la equipación.

### `.sp-chip` — etiqueta pequeña
`<i class="sp-chip">Beta</i>` · `<span class="sp-chip sp-kit">Nv 3</span>` · `<span class="sp-chip sp-ink">2v2</span>`. Oro por defecto, torcida −3°.

### `.sp-panel` — hoja para contenido largo (con mesura)
```html
<div class="sp-panel">…</div>            <!-- tinta translúcida 94 %, contorno, filo crema, sombra dura -->
<div class="sp-panel sp-paper">…</div>   <!-- papel crema con texto de tinta -->
```
Solo donde haga falta leer (Ajustes, Controles, Cómo se juega, Acerca de, Novedades, Estadística). Nunca a pantalla completa ni como
fondo de una página de botones: deja ver el partido alrededor.

### `.sp-hints` — barra de pistas
En el pie (`.menu-foot`/`.navhint`) o en cualquier barra de teclas: las `.key` salen como teclas crema con tinta.

### `.sp-page` — página del menú con el sistema
```html
<div class="mpage sp-page" id="mpX" data-page="x" data-sp-full hidden> <div class="mp-head sp-head">…</div> <nav data-nav>…</nav> </div>
```
`data-sp-full` hace que `ui.js setPage` ponga `#menu.sp-full` (sin velo ni relleno; esquinas DIRECTO, pantalla completa y pie con su
estilo). La página es una columna a la izquierda (`--sp-colw`, centrada en vertical); en vertical ocupa el ancho, con la cabecera arriba
y los botones abajo (el partido en medio).

## 4. API de `VB.Splat` (js/splat.js)

| Llamada | Qué hace |
|---|---|
| `decorate(root?)` | Pone el dibujo a los `.sp-btn .sp-ticket .sp-back .sp-patch .sp-stamp .sp-pair` de `root` (elemento, selector o documento) que no lo tengan (`.sp-dec`). Idempotente. Al cargar ya decora todo el documento. **Llámalo tras pintar con innerHTML.** |
| `watch(el)` | MutationObserver en un contenedor que se repinta (Carrera, listas): decora lo que entra. Uno por contenedor; nada por frame. |
| `sync()` | Lee la equipación (club de la Carrera activa o Ajustes · Equipación) y pinta `--sp-kit*` y `--sp-alt` en `:root`. Firma: no hace nada si no cambia. ui.js lo llama en `renderMenu`. |
| `setKit(0xRRGGBB)` / `kit()` | Fija / lee el color de equipación de los tokens. |
| `reduced()` | Menos movimiento (`ctx.reduceMotion` o el del sistema). |
| `press(el)` / `splash(el, ev?)` | Aplastar / salpicar a mano (el clic ya lo hace solo para todos los componentes). |
| `ICONS`, `BALL`, `SHAPES` | Iconos de la casa (SVG), balón turquesa y crema, y las siluetas de mancha. |

El salpicón sale en cualquier clic (ratón, dedo, Intro o A) de `.sp-btn`, `.sp-ticket` y `.sp-back`; el parche, el sello y las pestañas solo se hunden.

## 5. Navegación (ui.js)
- ↑/↓ recorren `[data-nav] button` en orden del DOM (como siempre). **Filas**: si varios botones van en horizontal, mételos en un
  contenedor con `data-sp-row`: ↑/↓ saltan de fila en fila (en la de destino, la misma columna o la última) y ←/→ se mueven dentro de
  la fila (rebote en los bordes). Los botones con `data-opt` siguen cambiando su valor con ←/→.
- Para que un botón no entre en ↑/↓ (pestañas no elegidas, pistas): `data-skip`.

## 6. Hacer y no hacer
- ✔ Añade clases al marcado existente y conserva ids y manejadores; las pruebas (`tools/*test.js`, `drive.js`, `touchplay.js`, `padplay.js`) buscan esos ids.
- ✔ Reparte colores y siluetas; un solo parche por pantalla; el sello para retos y medallas.
- ✔ Comprueba el foco con teclado y con `?mjfocus=<id>` en las capturas (cualquier id, cualquier página del menú).
- ✘ Tarjetas redondeadas iguales en rejilla, velos o paneles a pantalla completa, degradados oscuros detrás del menú.
- ✘ Texto de lectura en Titan One (solo rótulos cortos); texto largo en Rubik (`.sp-s`, `var(--sp-ui)`).
- ✘ Animaciones en bucle salvo el empujón del triángulo del parche enfocado; nada por frame en JS.
- ✘ Tocar los bloques SPLAT de otra pantalla: cada una tiene el suyo.

## 7. Cómo probar (capturas)
Tamaños obligatorios: **568×320, 640×360, 844×390 y 360×640 con `TOUCH=1`**, y **1280×720 y 1920×1080** sin táctil.
Mira cada captura (nada cortado ni montado, letra legible, toques ≥ 44 px, el partido a la vista) y el foco.

```bash
# portada, Jugar y Partido rápido
bash tools/shot.sh menu 1280 720 out/home.png
bash tools/shot.sh menu 1280 720 out/play.png "menu=play"
TOUCH=1 bash tools/shot.sh menu 844 390 out/quick-844.png "menu=quick"
# foco en un botón (cualquier id del menú; tras 2,6 s)
bash tools/shot.sh menu 1280 720 out/foco.png "menu=play&mjfocus=btnGym"
# portada con una Carrera de muestra (entrada de Carrera en brochazo)
bash tools/shot.sh menu 1280 720 out/home-carrera.png "mjseed=1"
# la portada de antes (comparar)
bash tools/shot.sh menu 1280 720 out/old.png "menu=old"
# paneles (Ajustes, Controles, Jugadores, Cómo se juega, Acerca de): ?panel=set|ctl|squad|tut|about (&tab=…)
bash tools/shot.sh menu 1280 720 out/ajustes.png "panel=set&tab=audio"
# escenas de depuración con pantalla propia (tools/shot.js las lista): pause, over, recap (&career=1), retos (&tab=hoy|maestria), reto_end,
# best, stats, look (&tab &venue &pick), prof (&tab=…&pfseed=demo), menupf, drill_end (&career=1), intro (&kind=…&career=1)
TOUCH=1 bash tools/shot.sh pause 844 390 out/pausa-844.png
# Carrera / pantallas sin escena: abrir con JS y capturar después
SHOT=out/carrera.png node tools/eval.js "mjseed=1" "VB.CareerUI.open('hub')" 4000 1280x720
```
Bucle cómodo para la matriz completa (6 tamaños × páginas): un `for` sobre `568x320 640x360 844x390 360x640 1280x720 1920x1080` con
`TOUCH=1` cuando el ancho es < 1000 (ver el guion del 17-nov en el informe de la etapa 1). Después: `bash tools/console.sh all 1280 720`
(y con `format=6v6`, `map=beach`) → «== sin errores JS ==», y las pruebas de UI (`keytest`, `padtest`, `touchtest`, `settest`, `abouttest`,
`drive.js 1280`, `TOUCH=1 node tools/touchplay.js 844x390 25`, `node tools/padplay.js`).

## 8. Estado (17-nov-2026, etapa 1)
Hechas con el sistema: portada (`?menu=old` = la de antes), Jugar y Partido rápido. El resto de pantallas siguen con la dirección TV
y se pasan en la etapa 2 (reparto por ficheros en el informe de la etapa 1 y en notes/ui_main.md «SPLAT»).

**Carrera (etapa 2d, 17-nov-2026).** Cada fichero de la Carrera lleva su bloque «SPLAT» en su propio `<style>` (career-ui.js `SPLAT_CSS`,
career-life-ui.js `SPLAT_L`, career-world-ui.js `SPLAT_W`) con el prefijo `Q = ':root:not(#_):not(#_):not(#_) #career'` (4 ids: gana a
las reglas viejas de index.html y a las de estructura del sistema). El HTML sigue siendo el de siempre: tras cada pintado,
`career-ui.js splatify()` pone las clases (la primera `.pri` que no esté en una fila → `.sp-patch`, una por pantalla; `.acts`/
`.pick-acts`/`.pl-acts` → `.sp-btn` con colores repartidos —claros en las hojas de tinta, tinta sobre el escenario o el papel—; las
decisiones de Fama → `.sp-btn.sp-wrap` en colores que contrastan; botones de fila → `.sp-sm`) y `VB.Splat.watch(#career)` las decora.
Piezas propias: `.cr-tk` (el próximo partido en `.sp-ticket` que no se pulsa, con los dos escudos en `.sp-crest`), `.cr-ovr` y `.cr-pos`
(tu media y el puesto final en `.sp-stamp` que no se pulsa), `.card` = hoja de tinta con la silueta de `.sp-panel` y su `h3` como
rótulo-pegatina torcido (oro, turquesa, crema o contraste según su puesto), segmentados y filtros (`.seg`, `.lg-sw`, `.cw-opt`) en trazos
de pincel, Faro en papel crema, noticias como recortes de papel, la vitrina y los premios en sellos dorados (`.tc-st`, `.lf-st`). La
sub-pestaña elegida y tu fila de la tabla van del color de tu club (`--sp-kit`, que `splatify` sincroniza con `VB.Splat.sync()`).
Captura de una pestaña: `SHOT=out/tabla.png node tools/eval.js "mjseed=1" "VB.CareerUI.open('hub',{from:'main'});VB.CareerUI._tab('league','table')" 4000 1280x720`.
