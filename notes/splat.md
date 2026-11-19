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

**Etapa 2 · Online, Cuenta, Instalar y varios (17-nov-2026).** `#mpOnline` es una `.sp-page` (cabecera fija con Volver); su CSS va en
js/netlobby.js (`CSS`, con `P` = refuerzo de 3 ids): salas = `.sp-ticket` (turquesa en pista, `.sp-gold` en la playa; llena u otra versión
= `disabled`), barra = manchas (`.ol-act.sp-btn`, una sola parada de ↑↓ con `data-skip` y ←→ propio de netlobby, NO `data-sp-row`),
crear sala = selectores `.sp-opt` de Partido rápido + «Abrir sala» en `.sp-patch`, ayuda / sala de espera / avisos / teclado del mando =
`.sp-panel`. Regla del lobby (bug del 17-nov): cada vista tiene UN bloque que se desplaza (`.ol-scroll`: cartelera, selectores, ayuda,
tarjeta) y la barra de abajo (Entendido, Abrir sala, Salir) queda fuera, siempre a la vista. Capturas sin red: `?olmock=1` (o `empty`,
`nortc`; solo file:// o localhost) y `VB.NetLobby._mock({view|msg|msgBad|status|rival…})`. Cuenta (js/account.js) e Instalar
(js/install.js): una hoja `.sp-panel` opaca sobre un tinte leve, la ✕ en pegatina crema fuera de la hoja y la fila de botones pegada
abajo (`position:sticky`); en apaisado bajo la Cuenta va a dos columnas. Capturas: `VB.Account._preview('enter'|'in'|'del', {tab, msg})`,
`VB.Account._showConflicts([...])`, `VB.Install._as('ios'|'android'|'app')`. Previa (`#intro`), repetición (`#rpBug/#rpCap/#rpSkip`),
telón (`#boot`) y el foco del campo de la Cuenta: bloque «SPLAT · CUENTA Y VARIOS» de index.html (rotaciones con la propiedad `rotate`
para no pisar las entradas animadas de TV, que usan `transform`).
**Pantallas hechas (etapa 2): pausa, hoja final, ejercicio y Estadística del partido** (bloque «SPLAT · PAUSA Y HOJA FINAL»). `#pause`,
`#end` y `#gymEnd` llevan `.sp-ov` (sin velo ni desenfoque) y su `.sheet.sp-sheet` es una columna a la izquierda (vertical: una
columna con la cabecera arriba y los botones abajo; apaisado de ≤ 430 px de alto: cabecera y botones | hoja). Cabecera en pegatinas
(`.sp-k`, `.sp-h`; el título de la victoria en oro) con el marcador en pegatina de tinta (`.p-score` / `.end-score`) y los sets en chapas
crema con el punto del color de quien lo ganó; lo que se lee va en UNA `.sp-panel` (`.end-body` con `#endTabs.sp-tabs`, `.ge-body`); la
acción principal es el parche (`#btnResume`, `#btnAgain`, `#btnGeAgain`) y el resto, manchas en fila (`.p-row`, `.end-more`, `.ge-more`
con `data-sp-row`). Nuevo para reutilizar: la letra del parche se ajusta al largo del rótulo (`--sp-n`, que pone ui.js `spLen`, con
`container-type:inline-size` en el parche), `.sp-btn.arm` (mancha roja que tiembla: segundo paso de Reiniciar o Abandonar) y
**`ui.js spFix/spSheets`**: si un rótulo se cambia con `textContent` (main.js, Carrera, «Pulsa otra vez…») se vuelve a envolver en `.sp-t`
y a decorar solo (MutationObserver por hoja). La Estadística del partido (`#panel .sheet.ms`) se pinta como `.sp-panel` con los equipos en
trazo de pincel (`#msTabs.sp-tabs`), partido y sets en chapas y las cifras en pegatinas. Escenas: `pause`, `over` (`&tab=stats|plays`),
`recap&career=1`, `best&tab=plays`, `reto_end`, `drill_end`, `stats`.
**Etapa 2 · Retos, Entrenamiento, Vestuario y Perfil** (bloque «SPLAT · RETOS, ENTRENAMIENTO, VESTUARIO Y PERFIL», 17-nov-2026): las
cuatro páginas llevan `data-sp-full`. Piezas nuevas para lo que venga: `.sp-medal` (medalla de `medalSVG` en pegatina redonda crema;
`.t3` dorada) y `.sp-bar` (barra de pintura con goterón: `<i class="sp-bar"><i style="--w:40%"></i></i>`, ui.js `spBar(fr)`; en
pegatinas de color el relleno pasa a crema). Una tarjeta que no se pulsa puede ser `.sp-ticket` en un `<div>` (brochazo con
`pointer-events:none`, como «Reto del día» y el nivel del Perfil); si su contenido se repinta con innerHTML, quitar `.sp-dec` y volver
a `decorate()`. Filas de lista: `.sp-btn.sp-wide.sp-calm` con la inclinación reducida en el bloque; lo bloqueado = cinta gris (rayas
`repeating-linear-gradient` y contorno apagado). Capturas con datos de muestra: guiones de `?debug=retos|prof|look` y `menu=play` + clic
en `#btnGym` (ver el informe de la etapa 2).
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
**Pantallas hechas: paneles (17-nov-2026, etapa 2).** Ajustes, Controles, Cómo se juega, Jugadores, Acerca de (Novedades, también la
que sale sola, y Créditos), Primer partido y el aviso «Gira el móvil», en el bloque **«SPLAT · PANELES»** de index.html. `ui.js openPanel`
pone `#panel.sp-pn` y `data-pn="<panel>"` (Estadística y Cambios no lo llevan y siguen con su estilo; la cabecera Volver + título sí es
común). Sin velo ni desenfoque: columna a la izquierda (`--pn-w`), Volver (`.sp-back`) y título (`.sp-h`) arriba, pestañas `.sp-tabs`
y el contenido en UNA hoja `.sp-panel.sp-scroll` que se desplaza por dentro (Volver y pestañas nunca se van); `ui.js spMore()` pone
`.sp-more` cuando queda algo abajo (franja pegada con flecha dorada). Filas de Ajustes = tiras de tinta (rótulo Titan One, ayuda
Rubik, foco con aro dorado), segmentados `.sp-seg`, deslizadores `.sp-slider`, muestras de equipación como gotas; teclas de Controles
= teclas crema (`.kslot`); atletas de Jugadores = `.sp-btn.sp-wide` (elegido `.sp-gold`); «Siguiente/¡A jugar!» del tutorial y «Ver
cómo se juega» = `.sp-patch`. Componente nuevo: **`.sp-pill`**, pastilla de pintura solo CSS para botones cuyo texto reescribe el
código con `textContent` («Restablecer» → «Pulsa otra vez», «Versiones anteriores», licencias): la mancha SVG de `.sp-btn` se perdería.
Capturas de estados (foco, desplazado, cada pestaña): guion `states.js` del informe de la etapa 2 (abre `?debug=menu&panel=…&tab=…&step=…`).

## 9. Móvil (18-nov-2026: «se ve todo muy cramped»; fundación)

El dispositivo principal es el **móvil en apaisado**. Todo lo de esta sección vive en el bloque «SPLAT: SISTEMA DE DISEÑO» de
index.html (sub-bloques «piezas nuevas que valen en TODOS los tamaños» y «— móvil (.ph) —») y en `js/splat.js`. Sin `.ph` no cambia
nada: PC y tableta siguen igual. Cada área añade aquí debajo, como mucho, una sub-sección corta con lo suyo.

### 9.1 Tiers
| Clase en `<html>` | Cuándo | Para qué |
|---|---|---|
| `ph` | `(max-height:500px) and (min-aspect-ratio:5/4)` o `?ph=1` (`?ph=0` lo quita) | todo el móvil apaisado (también una ventana de PC muy baja) |
| `ph-s` | `ph` y alto ≤ 345 (568×320, o con las barras del navegador) | quitar adornos (sello, vista previa, marca). **Nunca baja la letra.** |
| `ph-w` | `ph` y ancho ≥ 800 (844, 915) | dos zonas, acciones en columna a la derecha |

Lo pone un `<script>` en el `<head>` (tras el viewport) antes del primer pintado; `js/splat.js` lo repite al girar o cambiar de tamaño
(`window.__phTier()`) y lanza en `document` dos eventos con `{detail:{ph, s, w, flip}}`: **`vb:tier`** cuando cambia cualquiera de
`ph` / `ph-s` / `ph-w` (a 667×375 la barra del navegador cruza 345 de alto; ahí se rehace lo que el JS monta distinto en `.ph-s`, barato y
sin repintar pantallas enteras), y **`vb:ph`** solo cuando entra o sale `ph` (`flip`; las pantallas que se repintan enteras escuchan este,
para no borrar lo que se está escribiendo cuando sube o baja la barra). `VB.Splat.phone()` = boolean,
`VB.Splat.PHONE_MQ` = la consulta. Táctil sigue siendo `#app.is-touch` (solo para lo que es de dedo). El vertical (`#rotate`) no cambia.

### 9.2 Prefijo de las reglas del móvil
`:root.ph:not(#_):not(#_):not(#_)` (3 ids + 2 clases) en TODA regla del móvil: gana a la estructura (`:root:not(#_)×3`, 3 ids + 1 clase) y
a las `@media (max-height:430px)` viejas, sin importar el orden. **Ojo:** una regla vieja con un `#id` DETRÁS del prefijo
(`:root:not(#_)×3 #panel.sp-pn .sp-scroll`) vale 4 ids y gana; pon el mismo `#id` detrás del prefijo del móvil. En la Carrera:
`var PQ = Q.replace(':root', ':root.ph')`; en netlobby, account e install: `var PP = ':root.ph' + P.slice(5)`.
**Reglas viejas de móvil:** cada bloque pasa sus `(max-height:430px) and (min-aspect-ratio:5/4)` a su sección `/* — móvil (.ph) — */`
(al final del bloque, encima de su `/* ==== fin … ==== */`) con los valores nuevos y BORRA la vieja (si no, un `display:none` o un
`font-size:10px` viejo sigue debajo). El bloque del sistema ya lo ha hecho. Las reglas de vertical no se tocan.

### 9.3 Tokens (en `:root.ph`; la letra crece con el ANCHO de 568 a 915 px, nunca con vh)
| Token | 568 → 915 px | Uso |
|---|---|---|
| `--ph-cap` | 12 → 13 | chips, meta, contadores, «Nv», textos de sello |
| `--ph-label` | 13 → 14,5 | rótulos dorados sobre un valor, `th`, pestañas, la línea de ayuda de una fila |
| `--ph-body` | 14 → 16 | texto de lectura (Rubik 500, interlineado 1,4) |
| `--ph-row` | 15 → 17 | texto principal de una fila, rótulos de opciones (Titan) |
| `--ph-btn` | 15 → 18 | rótulos de `.sp-btn`, valor de `.sp-select` |
| `--ph-num` | 17 → 22 | cifras en filas y tablas (Rubik 700 tabular) |
| `--ph-head` | 18 → 22 | títulos de hoja o tarjeta, título del brochazo, cabeceras de sección (es LETRA) |
| `--ph-title` | 26 → 36 | `.sp-h` (título de pantalla) |
| `--ph-patch` | 22 → 30 | `.sp-patch .sp-t` |
| `--ph-hero` | 30 → 44 | marcador, nota, «23 de 30», cifras grandes |
| `--ph-s1…s5` | 4 · 8 · 12 · 16 · 24 | separaciones |
| `--ph-g` / `--ph-gt` / `--ph-gb` | `max(16px, zona segura)` a los dos lados (IGUALES), `max(8px, …)` arriba y abajo | márgenes seguros (con `max()`, nunca sumando) |
| `--ph-hh` | 48px | alto de la cabecera del marco (`.sp-fh`) |
| `--ph-vt` | `clamp(112px,15vw,140px)` | ancho de la columna de pestañas |
| `--ph-fw` / `--ph-ffw` / `--ph-colw` | panel lateral (el partido a la derecha) / ancho entero / columna del menú (≥ 38 % de partido) | anchos |
| `--ph-hit-gap` | 10px | hueco mínimo entre pegatinas que se tocan |
| `--ph-strip-gap` | 11px | entre pestañas de una tira `.sp-tabs-strip` (la elegida inclinada ensancha ~0,6 px por lado) |
| `--ph-tab-gap` | 12px | entre pestañas de una columna `.sp-vtabs`: la elegida va a -1,5° y sube/baja ~2 px |

Además, en `.ph`: `--sp-h-sm/md/lg` = 44 / 48 / 56, `--sp-r` 12px, `--sp-sh` `2px 3px 0`. Variables de componente reasignadas (todas las
pantallas crecen solas): `.sp-btn`/`.sp-md` → `--ph-btn`, `.sp-lg` → `--ph-btn` + 2, `.sp-sm` → `--ph-row`, `.sp-back` → `--ph-label` (44 px),
`.sp-s` → `--ph-cap`, `.sp-chip` → `--ph-cap`, pestañas de 44 a `--ph-label`, `.sp-seg>span` de 44 (trazo de 40) a `--ph-label` y ≥ 52 de
ancho, `.sp-select` con flechas de 34 en 44 y valor a `--ph-btn`, `.sp-h` → `--ph-title`, parche 56→68 con `--ph-patch`, sello 64→92,
brochazo 56→72 con escudos 32→42. Suelos: `.sp-btn` ≥ 44 de alto y ≥ 15 px de letra aunque una pantalla ponga sus variables con un `#id`
delante; `.sp-back` ≥ 13 px. Rótulos de `.sp-btn` y `.sp-back` y título del brochazo: **hasta 2 líneas, sin puntos suspensivos** (una
palabra que no cabe se corta: acórtala o da más ancho). `.sp-k` a `--ph-label` con `.04em`; `.sp-hints` oculto; `.sp-panel` con sombra
`4px 5px` y radio 14; inclinaciones ±1,4° (filas `.sp-wide.sp-calm` ±0,5° y sin gotas sueltas); `.sp-h` con contorno de 2 px; deslizador con
mando de 28 y franja de toque de 44; interruptor 56×32 con 44 de toque; DIRECTO y el pie del menú a `--ph-cap`.

### 9.4 Piezas (añade las clases a los elementos que YA existen: ids, manejadores, `data-nav`, `data-sp-row` y `data-skip` se quedan)
Solo en `.ph` (fuera del móvil no hacen nada): `.sp-frame`, `.sp-fh`, `.sp-fr`, `.sp-vtabs`, `.sp-tabs-strip`, `.sp-scroll` (comportamiento),
`.sp-body`, `.sp-dock`, `.sp-dock-l`, `.sp-lrow`, `.sp-li`, `.sp-sec`, `.sp-rows-2`, `.sp-tbl`, `.sp-tiles`, `.sp-info`/`.sp-help-full`, `.ph-hide`.
En todos los tamaños (son nuevas; solo salen si una pantalla las usa): la hoja de abajo (`#spSheets .sp-sheet`), `.sp-catch`, `#spToasts`,
`.sp-x`, `.sp-q`, `.sp-heros`, `.sp-kv`, `.ph-hid`, `.ph-only` (solo en el móvil), `.ph-2l`, `.kb-pin`,
`.sp-inrow`, `[data-kb-hide]`.

- **Marco** `.sp-frame[data-ph-frame="side"|"full"]` (rejilla en `position:absolute` dentro de los márgenes; hijos DIRECTOS): `.sp-fh`
  cabecera (Volver `.sp-back` a la izquierda, `.sp-h` en una línea, chips; a la derecha `.sp-fr` con «?», «⋯», contadores o ✕; el
  antetítulo `.sp-k` se oculta: si lleva información, que sea un `.sp-chip` tras el título) · `.sp-vtabs` (opcional, a la izquierda) ·
  `.sp-tabs-strip` (opcional, encima del cuerpo) · UNA zona que se desplaza (`.sp-scroll` o `.sp-body`) · `.sp-dock` (acciones; la
  principal es el ÚLTIMO hijo → abajo a la derecha; como mucho 2 secundarias; lo destructivo o Restablecer con `.sp-dock-l` va a la
  izquierda; un `.sp-patch` dentro toma su ancho, ≥ 160). Presupuesto a 568×320: 192 px de cuerpo con barra, 248 sin ella. Nunca una
  acción principal al final de un desplazamiento. Otro hijo sin una de esas clases cae en una celda cualquiera: dale clase o envuélvelo.
- **Pestañas**: el anfitrión de `VB.UI.tabs` lleva `data-ph-tabs="rail"` (columna, `.sp-vtabs`) o `"strip"` (tira, `.sp-tabs-strip`);
  `ui.js fitTabs` pone o quita la clase con el tier (al abrir, al repintar, al cambiar de pestaña y con `vb:ph`). En la tira, si no cabe,
  cambia a los rótulos cortos (`VB.UI.tabs(host, [{id, label, short, icon, badge}])`: `short` → `data-ph-short`) y si aún no cabe, desliza
  con desvanecido (`.sp-more-x`). La columna nunca va en solo-icono (`.tabs-ic`), sus rótulos van sin mayúsculas y pueden partir en 2
  líneas; las sin elegir, tinta clara opaca. La Carrera, que pinta sus pestañas a mano, usa las mismas clases.
- **Filas** `.sp-lrow` (en un `.sp-btn.sp-wide.sp-calm`): `.sp-rl` (escudo, medalla, dorsal; 36 px) | `.sp-rm` (`.sp-t` a `--ph-row`, 1-2
  líneas, y `.sp-s` a `--ph-label`, UNA línea: la única elipsis permitida) | `.sp-rt` (cifra a `--ph-num`, chip, control o «›»). ≥ 56 px.
  `.sp-li` = fila de datos SIN mancha SVG (tinta clara, contorno de 3, marca de 4 px a la izquierda del color `--li-c`; si se pulsa, ≥ 48).
  `.sp-me` = la tuya (equipación; llévala a la vista con `reveal`). `.sp-sec` = cabecera de sección pegada arriba del desplazamiento.
  `.sp-rows-2` (en la lista) = dos columnas cuando la lista mide ≥ 520 px.
- **Explicaciones**: en el móvil, los párrafos de explicación no se ven de entrada ni se borran: van detrás de **`.sp-q`** («?» redondo de
  44 px en la cabecera; `data-q-title` + `data-q-html` o `data-q-src="#id"`; el original puede llevar `.ph-hide`) o de **`.sp-info`** («i»
  de 44 dentro de la fila: despliega la `.sp-help-full` de la fila con `aria-expanded`). `VB.Splat.info(root)` pone un escuchador por raíz.
  La «i» es un `<span role=button>` dentro del `<button>` de la fila (sin foco propio): con teclado («I») o mando (X) sobre la fila
  enfocada, ui.js `infoKey()` llama a `VB.Splat.infoToggle(fila)`, que hace lo mismo que el toque.
  La línea de ayuda de cada fila se queda.
- **Cifras**: `.sp-heros` (2-4 cifras en UNA pegatina inclinada, separadas por filetes: `.sp-hn` cifra a `--ph-hero`, `.sp-hl` rótulo;
  variantes `.sp-paper` y `.sp-sm`) en lugar de rejillas de tarjetas; `.sp-kv` (`<dl>` con `dt` dorado y `dd`).
- **Tablas** `<div class="sp-tbl" data-ph-cols="0,1,4,6" data-ph-title="Clasificación"><table>…</table></div>` + `VB.Splat.tbl(div)`
  tras pintarla: en el móvil solo esas columnas y la pastilla «Ver tabla completa» (hoja con la tabla entera y desplazamiento lateral
  dentro). Celdas de 40 px a `--ph-row`, cifras con `.num` a `--ph-num`, `th` pegado arriba de SU desplazamiento, `tr.sp-me`. Nunca un
  desplazamiento lateral dentro del vertical.
- **Fichas** `.sp-tiles` (álbum, insignias, trofeos): rejilla de ≥ 84 px que se desplaza en VERTICAL, colores e inclinación alternos,
  `.won` dorada, rótulo `.sp-tl` en 2 líneas; tocar = hoja (nada de detalles al pasar el ratón).
- **Textos cortos**: `data-ph-short="…"` en un elemento solo de texto (lo aplican `decorate()` y el cambio de tier; las pestañas, solo si
  no caben). Para rótulos que el código reescribe con `textContent`, mejor una rama con `VB.Splat.phone()`. Utilidad `.ph-2l`.

### 9.5 API nueva de `VB.Splat`
| Llamada | Qué hace |
|---|---|
| `phone()` · `PHONE_MQ` · evento `vb:ph` | tier del móvil |
| `more(el)` | `.sp-more` (queda abajo) / `.sp-less` (desplazado) / `.sp-more-x` (queda a la derecha); se mide sola (scroll pasivo, ResizeObserver, MutationObserver). Idempotente. ui.js `spMore()` la usa en los paneles. En `.sp-frame>.sp-scroll` y la columna de pestañas pinta un desvanecido. |
| `reveal(el, {block:'center'\|'start'\|'nearest', inline, smooth})` | lleva el elemento a la vista DENTRO de su contenedor (no mueve la página) |
| `fitSeg(root)` | cada `.seg` de root en el móvil: sí/no → `.sp-toggle`; 2-3 que caben → se queda; 4+ o no cabe → `.sp-select` (flechas de 44; tocar el valor = la siguiente). Proxy de `<span>` (no `<button>`: no añade paradas de ↑↓) al lado; el original (`.ph-hid`) sigue mandando, recibe los toques y el proxy lo vigila. `data-ph-ctl="seg\|select\|toggle"` lo fuerza. Se rehace con `vb:ph`. |
| `sheet({title, html\|node, tone:'ink'\|'paper'\|'danger', cls, actions:[{label, cls, fn(api), primary, keep, id}], onClose, dock})` → `{el, body, close}` | hoja abajo a la derecha (centrada en PC), tinte del 20 %, ✕ crema, principal a la derecha (sin acciones: «Cerrar» crema a la izquierda); una a la vez; Esc / Retroceso / tinte / ✕ / B del mando la cierran; el foco entra y vuelve; `fn` que devuelve `false` (o `keep`) no la cierra; `dock: false` = sin barra de acciones (la hoja lleva sus botones dentro y solo la ✕ cierra: «⋯» del Vestuario) |
| `sheetOpen()` · `sheetEl()` · `closeTop()` | estado, nodo y cerrar. ui.js: `activeLayer()` devuelve la hoja (↑↓ y A dentro) y `VB.UI.back()` la cierra primero. |
| `modal(el)` → `release()` | tinte del 20 % justo debajo de un aviso (`#setNote`, aviso de colocador de la Carrera) |
| `info(root)` · `tbl(div)` · `shorten(root)` | «?» e «i», tablas, textos cortos (arriba) |
| `toast(html, {ms=3500, cls, key})` → `{el, close}` | aviso corto en el carril de arriba a la derecha (`#spToasts`, bajo DIRECTO; baja si hay una hoja abierta); tocar cierra; la misma `key` sustituye |
| `kbd()` (se instala sola) | teclado del móvil: `html.sp-kb`, `--kb-h`, `--vvh`; la hoja o panel del campo (`[data-kb-pin]`, `.sp-sheet`, `.sp-panel`) → `.kb-pin` arriba; `[data-kb-hide]` se oculta; `[data-kb-row]` → `.sp-inrow` (campo y botón en fila). Pruebas: `VB.Splat._kb(true, 160)` / `_kb(false)` |

### 9.6 Mapa del pulgar y números
Abajo a la derecha la principal; abajo a la izquierda lo secundario o reversible; borde izquierdo la columna de pestañas; arriba a la
izquierda Volver; arriba a la derecha ✕, «?», «⋯», pausa y avisos; arriba en el centro solo títulos y estado. Lo destructivo nunca junto a
lo común (24 px o un nivel más abajo). Letra: nada < 12 px, lectura ≥ 14, filas y botones ≥ 15, títulos 26-36, cifras grandes 30-44.
Toques ≥ 44×44, filas 48-56, parche 56-68, hueco 10. Una salida por pantalla; como mucho 5-6 decisiones a 568×320 (sin Volver ni
pestañas). Nunca: dos dedos, detalles solo al pasar el ratón, desplazamiento lateral de la página, salidas que se van con el contenido,
velos con desenfoque (el único tinte, el 20 % de la hoja o del aviso, y solo mientras está abierto).

### 9.7 Comprobar
`node tools/csscheck.js` (y `--cssom`): comentarios de los `<style>` y de las cadenas de CSS de js/, y que el navegador tiene `.sp-medal`,
`.sp-ov` y `.sp-pill` (el 18-nov faltaba el `/*` de tres cabeceras y se perdía la primera regla de cada bloque: medalla gigante en
Entrenamiento y Maestría, pastillas tinta sobre tinta). Cada cabecera de bloque empieza con `/*`. `node tools/mobaudit.js [--area …]
[--only …]` en 568×320, 667×375, 740×360, 844×390 y 915×412, y `--desktop`: además de lo de siempre, columnas `tier` (html.ph donde toca),
`despl` (con cada zona llevada al final, la salida y la principal siguen dentro y pulsables), `elip` (elipsis que cortan, salvo
`.sp-lrow .sp-s` y `[data-ph-ell]`), `pest` (pestañas que no caben sin desvanecido) y aviso de desplazamiento lateral; en metrics.json,
`fonts.read14 / btn15 / tab13` y `reach`. El diseño del móvil en PC: `?ph=1`.
