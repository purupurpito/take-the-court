# vendor/ — librerías y fuentes servidas por el propio juego

Desde el 24-nov-2026 (rama playstore, `notes/offline.md`) el juego no pide nada a otras webs para arrancar: three.js y las
fuentes van aquí y `tools/build-pages.js` las copia a `_site/vendor/` (sin este README). Así funciona sin red con el service
worker y la política de privacidad ya no tiene que nombrar a cdnjs ni a Google Fonts.

| Archivo | De dónde sale | Licencia |
|---|---|---|
| `three/three.min.js` | paquete oficial de npm `three@0.149.0`, `build/three.min.js`. Es byte a byte el mismo que servía cdnjs (sha1 `a13f10ad8e51d0398090f702eb553625fceded15`). | MIT, `three/LICENSE` |
| `fonts/*.woff2` | Google Fonts, los mismos archivos que daba la hoja `css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;0,900;1,700;1,800;1,900&family=Barlow:wght@400;500;600;700&family=Bowlby+One&family=Titan+One&family=Rubik:wght@500;600;700;800&display=swap` pedida con un Chrome de escritorio (todos los subconjuntos: latin, latin-ext, vietnamese, cyrillic, hebrew, arabic; 45 archivos, 0,78 MB). El navegador solo baja los que necesita el texto; el service worker los guarda todos. | SIL Open Font License 1.1, `fonts/OFL-<familia>.txt` (copiados de github.com/google/fonts) |
| `fonts/fonts.css` | la misma hoja de Google con las direcciones cambiadas a los archivos de al lado (mismos `unicode-range`, pesos y `font-display: swap`). | — |

Mismo aspecto: capturas a 568×320 antes y después (menú, Ajustes, marcador, pausa) con las mismas letras; `window.__vbFontFaces`
sigue dando 7.

## Cambiar algo

- **three.js**: no cambiar de versión sin probar todo (CONTRACT.md: r149 es la última sin aviso del build UMD). Para volver a
  bajarla: `npm pack three@0.149.0` y sacar `package/build/three.min.js` y `package/LICENSE`.
- **Una fuente o un peso nuevo**: pedir la hoja nueva a Google Fonts con un User-Agent de Chrome de escritorio, bajar los woff2,
  cambiar las direcciones de `fonts.css` a nombres locales (`familia_versión_id.woff2`) y añadir el `OFL-<familia>.txt`. El build
  mete en el service worker todo lo que nombra `fonts.css`.
- El index las carga con rutas relativas (`vendor/fonts/fonts.css`, `vendor/three/three.min.js`): funcionan en file:// (las
  herramientas de `tools/`), en localhost y en Pages. build-pages les pone `?v=<hash>` como a los js.
