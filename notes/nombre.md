# Nombre del juego: Take the Court (1.19.0, 20-nov-2026)

## Decisión (Ferran)
- Desde 1.19.0 el juego se llama **Take the Court** (marca comprobada y libre; dominio takethecourt.com comprado por Ferran).
  Antes fue «Make the Cut» (9-nov a 20-nov-2026, hasta 1.18.0) y, al principio, «Voley 3D».
- Cambia **todo lo que ve el jugador**: título de la pestaña (`T` en js/ui.js, también «Pausa — …», «Set N | a-b — …»…), logotipo
  animado (rótulo TAKE THE COURT, mismo estilo), metadatos, Open Graph y manifest (tools/build-pages.js), aviso de girar el móvil,
  pantalla de error, tutorial de instalar, compartir sala del online, competición por defecto del acta, novedades, las letras de la
  gorra del online («TTC»), las letras de la red («T T C»), las vallas LED y la banda de la red de playa.
- Cambian también las cabeceras de código (`TAKE THE COURT — js/<fichero>`) y la documentación. Excepción: js/sim.js, js/ai.js y
  js/ai6.js siguen con `MAKE THE CUT —` (no se tocan sin un cambio de juego: fluidsimtest firma el texto de sim.js con SIM_BASE). Las notas que cuentan historia
  (renombre voley-3d → make-the-cut, la revisión de marcas de «Make the Cut», notes/informes-build.md, notes/s234/) mantienen el
  nombre viejo donde describen lo que pasó.
- Casa nueva: https://takethecourt.com/ (raíz). La dirección vieja (purupurpito.github.io/make-the-cut/) pasa a ser el puente que
  trae las partidas (bridge/, notes/dominio.md).

## Lo que NO cambia (identificadores internos, el jugador no los ve)
| Identificador | Dónde | Por qué se queda |
|---|---|---|
| Claves `make-the-cut.*` de localStorage y sessionStorage (account, career, squad, settings, look, profile, retos, gym, legends, seen, …, y sus `.bak` / `.prev`) | todos los módulos; index.html migra `voley3d.*` → `make-the-cut.*` | cambiarlas borraría las partidas guardadas; el puente y js/migrate.js cuentan con ellas |
| Proyecto de Firebase `make-the-cut-vb`, su `authDomain` `make-the-cut-vb.firebaseapp.com` y el dominio de correo interno `@cuentas.make-the-cut.invalid` | js/account.js, js/netlobby.js, pages/netlogs.html, firebase/ | las cuentas y su progreso viven ahí; un proyecto nuevo dejaría a todos sin datos |
| Colecciones y campos de Firestore | firebase/firestore.rules, account.js, net*.js | datos en la nube y reglas desplegadas |
| Id de aspecto `gorraMTC` (ahora dibuja «TTC») | js/look.js, js/doll.js, pruebas y tools/fixtures/looks-1.15.1.json | va guardado en el vestuario de cada jugador y en la nube |
| Semilla `'mtc-dia-'` | js/retos.js (`hashStr('mtc-dia-' + k)`) | cambiarla cambia el reto diario de todo el mundo |
| Canal `'mtc-net-'` (BroadcastChannel) y emulador `'demo-mtc'` | js/net.js, js/netlobby.js | compatibilidad del online entre versiones y pruebas |
| Prefijo `'mtc-'` de los ids de acta | js/acta.js | ids de actas ya exportadas |
| Ids SVG `mtc*` (`mtcDefs`, `mtcLogo`, `mtcT`, `mtcWhole`…) y `VB_logoCut` | index.html, js/ui.js, tools/og-image.js | los usa la animación del logotipo y el generador de og.png |
| Nombres de código `NET_MTC`, `MTC_ROWS`, `mtcInk`, `mtcPanel` | js/arena.js, js/doll.js | solo nombres de variables |
| Historial del repo, `tools/workflow/make-the-cut.workflow.js` | git | historia |

- El «MTC» del club Montecielo (tools/leagues-fixture.js, ligas) es su abreviatura de club: no tiene que ver con el juego.
- No hacer nunca un `sed` global de «make-the-cut» o «MTC»: rompe guardados, retos y pruebas. Cambiar solo textos visibles, con
  lista de ficheros explícita.
