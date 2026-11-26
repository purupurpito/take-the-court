# vendor/ — librerías y fuentes servidas por el propio juego

Desde el 24-nov-2026 (rama playstore, `notes/offline.md`) el juego no pide nada a otras webs para arrancar: three.js y las
fuentes van aquí y `tools/build-pages.js` las copia a `_site/vendor/` (sin este README). Así funciona sin red con el service
worker y la política de privacidad ya no tiene que nombrar a cdnjs ni a Google Fonts.

| Archivo | De dónde sale | Licencia |
|---|---|---|
| `three/three.min.js` | paquete oficial de npm `three@0.149.0`, `build/three.min.js`. Es byte a byte el mismo que servía cdnjs (sha1 `a13f10ad8e51d0398090f702eb553625fceded15`). | MIT, `three/LICENSE` |
| `fonts/*.woff2` | Fontsource 5.3.0 (npm `@fontsource-variable/big-shoulders-display`, `@fontsource-variable/chivo` y `@fontsource-variable/doto`), carpeta `files/` por cdn.jsdelivr.net: las versiones variables (eje wght) de los subconjuntos latin y latin-ext (Doto, solo latin). 5 archivos, unos 125 KB. Big Shoulders Display para rótulos y cifras grandes, Chivo para el texto y Doto para el marcador del pabellón. | SIL Open Font License 1.1: `fonts/OFL-bigshoulders.txt` (github.com/xotypeco/big_shoulders), `fonts/OFL-chivo.txt` y `fonts/OFL-doto.txt` (github.com/google/fonts) |
| `fonts/OFL-barlowcondensed.txt` | Se queda porque el rótulo del telón usa un recorte de Barlow Condensed incrustado en el index («VB Marca»). | SIL Open Font License 1.1 |
| `fonts/fonts.css` | `@font-face` escritos a mano con los mismos `unicode-range` que trae Fontsource (`font-weight: 100 900`, `font-display: swap`). | — |

`window.__vbFontFaces` cuenta las caras que han cargado al arrancar (4: dos pesos de cada familia de la interfaz).

## Cambiar algo

- **three.js**: no cambiar de versión sin probar todo (CONTRACT.md: r149 es la última sin aviso del build UMD). Para volver a
  bajarla: `npm pack three@0.149.0` y sacar `package/build/three.min.js` y `package/LICENSE`.
- **Una fuente nueva**: bajar el woff2 variable de Fontsource (`files/<familia>-latin-wght-normal.woff2` y `-latin-ext-`), añadir su `@font-face` a `fonts.css` con el `unicode-range` de su `index.css` y el `OFL-<familia>.txt`. Al ser variables, cualquier peso entre 100 y 900 sale del mismo archivo. El build mete en el service worker todo lo que nombra `fonts.css`.
- El index las carga con rutas relativas (`vendor/fonts/fonts.css`, `vendor/three/three.min.js`): funcionan en file:// (las
  herramientas de `tools/`), en localhost y en Pages. build-pages les pone `?v=<hash>` como a los js.
