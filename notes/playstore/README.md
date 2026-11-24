# Google Play: índice (rama playstore, 24-nov-2026)

Todo lo que pide Google Play para publicar Take the Court como app de Android (TWA sobre https://takethecourt.com): ficha,
políticas, formularios y gráficos. Nada de esto está publicado todavía: hace falta rellenar los huecos y publicar la web.

## Por dónde empezar

1. Rellenar los huecos (lista abajo) y tomar las decisiones pendientes.
2. Seguir `checklist.md` fase por fase (cuenta de desarrollador, Bubblewrap, assetlinks, ficha, pruebas cerradas, producción).
3. Antes de publicar la web con las páginas legales:
   `STRICT_POLICY=1 node tools/build-pages.js` (falla si quedan huecos) y `node tools/policytest.js`.

## Qué hay

### Páginas que se publican con el juego

| Archivo | Dirección | Qué es |
|---|---|---|
| `pages/privacidad.html` | https://takethecourt.com/privacidad.html | Política de privacidad. Español arriba, inglés en `#en`. Es la «URL de la política de privacidad» de la ficha. |
| `pages/borrar-cuenta.html` | https://takethecourt.com/borrar-cuenta.html | Cómo borrar la cuenta (juego, esta página o correo), qué se borra y qué se queda. Es la «URL para borrar la cuenta» del formulario de Seguridad de los datos. |

En el juego: Ajustes › Info › «Privacidad» abre la política en otra pestaña.

### Notas en esta carpeta

| Archivo | Qué es |
|---|---|
| `checklist.md` | Pasos ordenados de principio a fin, marcados [TÚ], listo o [CÓDIGO]. Lo que puede cambiar en Play va con «⚠ Comprobar en la Consola». |
| `ficha.md` | Textos de la ficha en es-ES y en-US (nombre, descripción breve y completa, con recuentos), categoría, etiquetas, contacto y estado de los gráficos. |
| `seguridad-datos.md` | Formulario de Seguridad de los datos contestado pregunta por pregunta, con la línea de código que respalda cada respuesta. |
| `clasificacion.md` | Cuestionario IARC, público objetivo, anuncios, acceso a la app para los revisores (con cuentas de prueba) y otras declaraciones. |
| `privacidad.md` | Cómo funcionan las dos páginas legales, el borrado de la cuenta, y qué cambios del código obligan a tocar la política. |
| `graficos/` | Icono 512, gráfico destacado 1024×500, 8 capturas de móvil y 4 de tablet. `graficos/README.md` dice qué es cada uno y en qué orden subirlos. |

### Herramientas

| Comando | Para qué |
|---|---|
| `node tools/policytest.js` | Pruebas de las páginas legales (contenido frente al código, build, Chrome a 360×640 y 568×320, borrado de la cuenta con sus fallos). `KEEP=1` guarda capturas. |
| `STRICT_POLICY=1 node tools/build-pages.js` | Build que falla si faltan las páginas legales o quedan huecos. |
| `node tools/storeshots.js --out notes/playstore/graficos` | Vuelve a sacar todos los gráficos del juego (un minuto más o menos). |

## Huecos para rellenar

| Hueco | Dónde | Qué poner |
|---|---|---|
| `Ferran Sanchís Armesto` | `pages/privacidad.html` (es y en), `checklist.md` | Nombre o razón social del responsable de los datos. |
| `help@takethecourt.com` | las dos páginas (texto y `mailto:`), `ficha.md`, `checklist.md`, `clasificacion.md`, `seguridad-datos.md` | Correo de contacto para privacidad y borrado. |
| `{{USUARIO_PRUEBA_1/2}}`, `{{CLAVE_PRUEBA_1/2}}` | `clasificacion.md` (acceso a la app) | Dos cuentas de prueba para los revisores (para probar el online entre las dos). |
| `{{PAQUETE}}`, `{{SHA256_FIRMA_APP_PLAY}}`, `{{SHA256_CLAVE_SUBIDA}}` | `checklist.md` (assetlinks.json) | Nombre del paquete y huellas de las claves (salen de la Consola y de Bubblewrap). |
| `{{RESUMEN_COMENTARIOS}}`, `{{ESTIMACION}}`, `{{CAMBIOS_TRAS_PRUEBA}}` | `checklist.md` (solicitud de producción) | Lo que salga de la prueba cerrada. |

## Decisiones pendientes

1. **Nombre del paquete** (permanente). Propuesta: `com.takethecourt.app`.
2. **Nombre público de desarrollador** y si se declara **comerciante en la UE** (si sí, se publican dirección y teléfono).
3. **Informes de red (netlogs).** Hoy no se borran nunca, ni al borrar la cuenta; las páginas lo dicen. Opciones: Cloud Function
   que los borre al borrar el usuario (necesita el plan Blaze), plazo de 90 días con TTL de Firestore, o las dos. Si se elige
   una, cambiar las dos páginas (es y en) y `seguridad-datos.md`.
4. **Otro dispositivo con la sesión abierta** puede volver a subir partidas durante una hora como mucho después de borrar la
   cuenta (su token sigue vigente). La página lo avisa. Solo lo arregla del todo una Cloud Function al borrar el usuario.
5. **Edad.** La política dice 14 años para la cuenta y el online; la ficha recomienda público 16+ (más estricto a propósito,
   explicado en `clasificacion.md` §2.1). Si se quiere una sola cifra, subir la política a 16.
6. **Identificador del dispositivo** dentro del perfil que se sube: declararlo (como ahora) o dejar de subirlo.
7. **Contenido de usuarios**: nombre visible por defecto anónimo, filtro de palabras, ocultar o denunciar nombres. Recomendado
   antes de abrir el público a menores de 16.
8. **Ficha en inglés** mientras el juego solo está en español (la descripción en inglés lo avisa al final).
9. **Icono** dibujado al 82 % para que la máscara redonda no corte la «T» (`ICON_SCALE` en `tools/storeshots.js`).
10. **«BETA»** en el logotipo del menú: sale en las capturas de portada. Si la ficha es de versión final, quitarlo y repetirlas.
11. **Compromisos de las páginas**: contestar en un mes, borrar por correo en 30 días, avisar en el juego de cambios
    importantes, y que para borrar hay que haber entrado hace 5 minutos como mucho. Cambiar el texto si no se quieren.
12. **Transferencias**: la política dice que Google, GitHub y Cloudflare se basan en el Marco de Privacidad UE-EE. UU. o en
    cláusulas tipo. Es lo habitual en esos servicios, pero conviene comprobarlo.

## Otros avisos

- La sala online a 640×360 desplaza y las reglas quedan medio difuminadas abajo (es el diseño del lobby, que avisa de que hay más).
  Por eso la captura `movil-05` se saca a 720×405. Si se quiere que quepa entera en móviles de 360 de alto, ajustar el lobby.
- `pages/netlogs.html` (de otra pista, ya publicada) tiene un comentario con el nombre del dueño. Conviene quitarlo.
- `assetlinks.json` lo tiene que escribir `tools/build-pages.js` (no se puede poner una carpeta `pages/.well-known`): ver `checklist.md`.
