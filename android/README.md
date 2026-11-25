# App de Android de Take the Court (TWA)

Proyecto generado por Bubblewrap a partir de `twa-manifest.json`. Solo se edita `twa-manifest.json`; el resto se regenera con
`bubblewrap update`. Abre https://takethecourt.com a pantalla completa: el juego se actualiza por la web.

Pasos (clave de subida, compilar, huellas, Play): `notes/playstore/android.md`. Prueba: `node tools/twatest.js`.

Licencias: `app/src/main/assets/NOTICE.txt` lleva los avisos de Apache 2.0 de Android Browser Helper (© Google LLC), AndroidX (© The
Android Open Source Project) y la plantilla de Bubblewrap, con el texto de la licencia. **`bubblewrap update` no lo crea**: después de
regenerar, comprueba que sigue ahí (`git status`) y, si lo ha borrado, recupéralo con `git checkout -- app/src/main/assets/NOTICE.txt`.

Las claves (`*.keystore`, `*.jks`) **nunca** van aquí: fuera del repo y con copia en dos sitios.
