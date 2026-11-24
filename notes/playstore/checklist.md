# Checklist de Google Play — Take the Court (TWA de takethecourt.com)

Pasos en orden para publicar el juego en Google Play con una **cuenta de desarrollador personal nueva**, como Trusted Web
Activity (TWA) que abre `https://takethecourt.com`.

Leyenda:

- **[TÚ]**: lo tiene que hacer el responsable en persona (pagos, identidad, claves, decisiones legales).
- **[LISTO]**: el texto o la respuesta ya está preparado en esta carpeta.
- **[CÓDIGO]**: cambio en el repo que hace otra pista (no se publica nada sin permiso).
- **⚠ Comprobar en la Consola**: dato de política que Google cambia a menudo. Lo de aquí es lo que había publicado Google hasta
  2026; la Consola y la ayuda oficial mandan.

Archivos de esta carpeta:

- [ficha.md](ficha.md): ficha de Play en es-ES y en-US, recuentos de caracteres y recursos gráficos.
- [seguridad-datos.md](seguridad-datos.md): formulario de Seguridad de los datos.
- [clasificacion.md](clasificacion.md): IARC, público objetivo, anuncios, acceso a la app y demás declaraciones.

Páginas web que se enlazan (las hace otra pista; tienen que estar publicadas antes de enviar nada):

- `pages/privacidad.html` → `https://takethecourt.com/privacidad.html`
- `pages/borrar-cuenta.html` → `https://takethecourt.com/borrar-cuenta.html`

(tools/build-pages.js copia todos los archivos sueltos de `pages/` a la raíz del sitio, así que basta con crearlos allí.)

---

## Fase 0. Antes de abrir la cuenta: lo que tiene que estar en la web

| # | Paso | Quién | Estado |
|---|---|---|---|
| 0.1 | Política de privacidad publicada en `/privacidad.html`, con `Ferran Sanchís Armesto` y `help@takethecourt.com` rellenados. Tiene que nombrar la app, decir qué datos se recogen y para qué, con quién se comparten (proveedores: Google Firebase en la UE, GitHub, Cloudflare, STUN; desde el 24-nov-2026 three.js y las fuentes van en `vendor/` y ya no se nombran cdnjs ni Google Fonts), la IP que ve el rival en el online, los informes de red, cuánto se conserva cada cosa, cómo borrar la cuenta, los derechos del RGPD y la reclamación ante la AEPD. HTML normal, sin PDF y sin pedir sesión. | [CÓDIGO] + [TÚ] revisa | Pendiente |
| 0.2 | Página de borrado en `/borrar-cuenta.html`: pasos dentro del juego, vía por correo sin la app, qué se borra y qué se conserva y cuánto tiempo. | [CÓDIGO] + [TÚ] | Pendiente |
| 0.3 | Enlace a la política **dentro del juego** (Ajustes › Info o el panel de Cuenta). Play lo pide a las apps con cuentas. | [CÓDIGO] | Pendiente |
| 0.4 | Borrado incompleto: salas y errores, arreglados; netlogs con `exp` a 90 días (código y reglas, 24-nov-2026). [TÚ]: desplegar las reglas, activar el TTL de `netlogs.exp` y borrar los informes de antes, ANTES de publicar las páginas (README «Decisiones» 3). | [CÓDIGO] listo + [TÚ] | Pendiente ([TÚ]) |
| 0.5 | Decidir sobre el id de dispositivo que sube en el perfil (declararlo o que no suba; js/profile.js:8 y :17). | [TÚ] decide | Hoy se declara (seguridad-datos.md §2.14) |
| 0.6 | Recomendado: nombre visible por defecto anónimo y filtro básico de nombres (hechos, 24-nov-2026: js/namefilter.js) y «Ocultar o denunciar nombre» (pendiente) (clasificacion.md §6). | [CÓDIGO] | Parcial |
| 0.7 | three.js y las fuentes servidas desde takethecourt.com (`vendor/`) y service worker (`sw.js`, `js/sw-reg.js`): la app abre y se juega sin red tras la primera visita (`notes/offline.md`, `node tools/offlinetest.js`). Tiene que estar publicado antes de mandar la ficha con «Juega sin conexión» (ficha.md §5.1). | [CÓDIGO] | Hecho (24-nov-2026), falta publicar |
| 0.8 | `/.well-known/assetlinks.json`: está en `pages/.well-known/assetlinks.json` con el paquete y **dos huecos** para las huellas SHA-256 (se rellenan en la Fase 4). build-pages copia `pages/` entera con subcarpetas y escribe `.nojekyll`, así que sale en `_site/.well-known/` (lo comprueba `node tools/twatest.js`). Tras publicar, comprobar con `curl -i https://takethecourt.com/.well-known/assetlinks.json` que da 200, `application/json` y sin redirecciones. | [CÓDIGO] hecho · [TÚ] huellas | Falta rellenar las huellas |

---

## Fase 1. Cuenta de desarrollador

| # | Paso | Quién | Nota |
|---|---|---|---|
| 1.1 | Usar una cuenta de Google dedicada al proyecto (no la personal de todos los días), con verificación en dos pasos. | [TÚ] | La cuenta queda ligada para siempre a la app. |
| 1.2 | Entrar en `https://play.google.com/console/signup` y elegir **«Para ti» (cuenta personal)**. | [TÚ] | La cuenta de organización pide número **D-U-N-S** y es para empresas; para un proyecto personal no hace falta. |
| 1.3 | Pagar la **cuota única de 25 USD** con tarjeta. | [TÚ] | ⚠ Comprobar el importe en la Consola. |
| 1.4 | Nombre de desarrollador público, correo de contacto (`help@takethecourt.com`), teléfono y dirección (privados). | [TÚ] | El nombre público puede ser de estudio. El correo de contacto se publica en la ficha. |
| 1.5 | **Verificación de identidad**: nombre legal y dirección iguales que en el documento oficial (DNI o pasaporte). Puede tardar unos días. | [TÚ] | Sin esto no se puede publicar. |
| 1.6 | Verificar el correo y el teléfono de contacto. | [TÚ] | |
| 1.7 | **Verificar que tienes un dispositivo Android real** con la app Play Console para móvil (requisito de las cuentas personales nuevas). | [TÚ] | ⚠ Comprobar en la Consola. |
| 1.8 | Desde 2026 Google pide verificar a todos los desarrolladores de apps Android; en Play se cubre con la verificación de la Consola. | [TÚ] | ⚠ Comprobar si la Consola pide algún paso más. |

---

## Fase 2. Estado de comerciante (Ley de Servicios Digitales de la UE)

| # | Paso | Quién | Nota |
|---|---|---|---|
| 2.1 | Play Console › Configuración › Información del desarrollador: declarar si eres **comerciante** («trader») o no. | [TÚ] | Si eres comerciante, Play **publica** dirección, teléfono y correo en la ficha para los usuarios de la UE. Un juego gratis, sin anuncios ni compras, hecho como afición, suele encajar en «no comerciante», pero es una decisión legal: si hay dudas, consultarlo. Si no se declara, Play puede quitar la app de la UE. ⚠ Comprobar en la Consola. |

---

## Fase 3. Crear la app en la Consola

| # | Paso | Quién | Valor |
|---|---|---|---|
| 3.1 | «Crear app» › nombre | [TÚ] | `Take the Court: vóley 3D` o `Take the Court` (ficha.md §2) |
| 3.2 | Idioma predeterminado | [TÚ] | Español (España) – es-ES |
| 3.3 | App o juego / gratis o de pago | [TÚ] | Juego · Gratis |
| 3.4 | Aceptar las Políticas del programa para desarrolladores, las leyes de exportación de EE. UU. y las condiciones de Play App Signing | [TÚ] | |

---

## Fase 4. Construir la TWA (Bubblewrap) y las claves

| # | Paso | Quién | Nota |
|---|---|---|---|
| 4.1 | **Nombre de paquete** (`packageId`): propuesto `com.takethecourt.app`, ya puesto en `android/twa-manifest.json` y en `pages/.well-known/assetlinks.json`. **No se puede cambiar nunca** después de subir la primera versión. Si se elige otro, cambiarlo en los dos sitios y `bubblewrap update` (twatest comprueba que coinciden). | [TÚ] decide | Solo minúsculas, puntos y guiones bajos. Mejor un dominio que controlas al revés. |
| 4.2 | Instalar Bubblewrap (`npm i -g @bubblewrap/cli`) y comprobar con `bubblewrap doctor` el JDK 17 y el SDK de Android. En este PC ya están (`~/.bubblewrap/config.json`). | [TÚ] | android.md §1. ⚠ La versión de JDK que pide Bubblewrap puede cambiar. |
| 4.3 | Proyecto de la TWA: **ya generado** en `android/` con Bubblewrap 1.27 (no hace falta `bubblewrap init`). Solo se edita `android/twa-manifest.json`; el resto se regenera con `bubblewrap update`. | [LISTO] | android.md, tabla de valores. `node tools/twatest.js` comprueba que cuadra con el manifest de la web. |
| 4.4 | Valores de `twa-manifest.json`: host `takethecourt.com`; start URL `/`; nombre y `launcherName` «Take the Court»; display **fullscreen**; orientación **landscape** (igual que el manifest de la web); colores `#070B14`; icono `icon-512.png` e icono adaptable `icon-maskable.png`; **notificaciones: no**; **ubicación: no**; **Play Billing: no**; fallback **Custom Tabs**; `appVersionCode` 1 y `appVersionName` «1.0.0» (versión de la app, no del juego); minSdk 24. | [LISTO] · [TÚ] revisa | Sin notificaciones ni ubicación, la app no pide permisos sensibles (clasificacion.md §5). `pages/icon-maskable.png` ya es la copia de `graficos/icono-512.png` y va en el manifest de la web como `maskable`: publicar la web antes del primer `bubblewrap update`. |
| 4.5 | **Nivel de API objetivo**: Play exige un `targetSdkVersion` mínimo para apps nuevas y actualizaciones. Desde el 31-ago-2025 era Android 15 (API 35); desde el 31-ago-2026, lo esperable es **Android 16 (API 36)**. El proyecto generado lleva **36**. | [LISTO] | ⚠ Comprobar la cifra actual en la Consola y en la ayuda «Requisito de nivel de API objetivo». |
| 4.6 | **Clave de subida (upload key)** con `keytool`, fuera del repo y en una ruta sin espacios (por ejemplo `C:\claves-ttc\take-the-court-subida.keystore`, alias `subida`). | [TÚ] | android.md §2 (comando exacto). |
| 4.7 | **Copia de seguridad de la clave**: el `.keystore`, su alias y las dos contraseñas, en **dos sitios distintos** fuera del repo (por ejemplo, gestor de contraseñas + disco cifrado). **Nunca** en git ni en el repo público (`android/.gitignore` las ignora y twatest falla si encuentra una). | [TÚ] | Con Play App Signing, si se pierde la clave de subida se puede pedir otra a Google, pero lleva días. |
| 4.8 | En `android/`: `bubblewrap build --signingKeyPath=<ruta de la clave> --signingKeyAlias=subida` → `app-release-bundle.aab` (lo que se sube a Play) y `app-release-signed.apk` para probar. | [TÚ] | android.md §4. Play solo acepta AAB en apps nuevas. Ya se compiló aquí una prueba de depuración y el AAB sin firmar: salen bien. |
| 4.9 | Subir el primer AAB (a Pruebas internas, Fase 6) con **Play App Signing** activado (obligatorio en apps nuevas): Google guarda la clave de firma de la app. | [TÚ] | android.md §3. |
| 4.10 | Copiar las huellas **SHA-256**: la de **firma de la app** (Google) de Consola › Probar y publicar › Configuración › **Integridad de la app**, y la de **subida** con `keytool -list -v` (o de la misma página). | [TÚ] | android.md §5. ⚠ El menú puede llamarse distinto. |
| 4.11 | Pegar las dos huellas en `pages/.well-known/assetlinks.json` (en lugar de `{{SHA256_FIRMA_APP_PLAY}}` y `{{SHA256_CLAVE_SUBIDA}}`), pasar `STRICT_TWA=1 node tools/twatest.js`, publicar la web y comprobarlo con la herramienta de Google (https://developers.google.com/digital-asset-links/tools/generator) o con `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://takethecourt.com&relation=delegate_permission/common.handle_all_urls`. | [TÚ] (+ [CÓDIGO] si se quiere) | android.md §5 y §7. Si falla, la TWA enseña la barra de direcciones de Chrome arriba. |

`pages/.well-known/assetlinks.json` (ya en el repo; solo faltan las huellas):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.takethecourt.app",
      "sha256_cert_fingerprints": [
        "{{SHA256_FIRMA_APP_PLAY}}",
        "{{SHA256_CLAVE_SUBIDA}}"
      ]
    }
  }
]
```

### 4.12 Pruebas en un móvil real antes de la prueba cerrada

| Qué probar | Por qué |
|---|---|
| Se abre a pantalla completa, sin barra de direcciones | assetlinks correcto |
| **Entrar con Google** funciona (usa ventana emergente, js/account.js:441-450) | Sin comprobar en TWA. Si falla, la cuenta con correo sigue valiendo; mirar la redirección o Credential Manager. |
| El aviso «Instalar» de js/install.js **no** sale | Detecta `display-mode` fullscreen o standalone (js/install.js:26); sin comprobar en TWA. |
| El aviso de versión nueva y «Reiniciar» (js/update.js) | Las actualizaciones del juego llegan por la web, sin subir otro AAB. |
| Vibración, mando, compartir sala y enlace de la semana | APIs del dispositivo (inventario §F). |
| Abrir sin red | Tras abrirla una vez con red, en modo avión: arranca el juego y se juega (Partido rápido, Carrera). La primera vez sin red sale la pantalla sin conexión de Bubblewrap. |
| Tamaños 360×640 vertical y 568×320 apaisado | Móvil primero: comprobar que nada se corta. |
| Que el progreso de Chrome **no** pasa solo a la TWA | La TWA comparte el almacenamiento de Chrome para el origen, así que normalmente sí lo comparte; sin comprobar tras desinstalar. Contarlo bien en borrar-cuenta.html. |

---

## Fase 5. Ficha y contenido de la app

Todo en Play Console › **Panel › Configura tu app** (el orden de la Consola puede variar).

| # | Paso | Quién | Dónde |
|---|---|---|---|
| 5.1 | Política de privacidad: `https://takethecourt.com/privacidad.html` | [LISTO] el valor · [TÚ] lo pega | clasificacion.md §5 |
| 5.2 | Acceso a la app (con las dos cuentas de prueba creadas por ti) | [LISTO] texto · [TÚ] crea las cuentas | clasificacion.md §4 |
| 5.3 | Anuncios: No | [LISTO] | clasificacion.md §3 |
| 5.4 | Clasificación del contenido (IARC) | [LISTO] | clasificacion.md §1 |
| 5.5 | Público objetivo y contenido: 16-17 y 18+ | [LISTO] · [TÚ] decide si 13+ | clasificacion.md §2 |
| 5.6 | App de noticias: No · COVID-19: No · Gubernamental: No · Funciones financieras: No · Salud: No | [LISTO] | clasificacion.md §5 |
| 5.7 | ID de publicidad: no se usa | [LISTO] | clasificacion.md §3 |
| 5.8 | Seguridad de los datos (incluye la URL de borrado) | [LISTO] · [TÚ] revisa §0 | seguridad-datos.md |
| 5.9 | Categoría (Juegos › Deportes), etiquetas y datos de contacto | [LISTO] | ficha.md §1 |
| 5.10 | Ficha principal es-ES y traducción en-US | [LISTO] | ficha.md §2 y §3 |
| 5.11 | Icono 512, gráfico de funciones 1024×500 y capturas | [TÚ] o [CÓDIGO] | ficha.md §4 y `notes/playstore/graficos/` (todo hecho; orden de subida en graficos/README.md) |
| 5.12 | Países: todos o empezar por España | [TÚ] decide | Producción › Países y regiones |

---

## Fase 6. Pruebas internas (opcional, rápido)

| # | Paso | Quién | Nota |
|---|---|---|---|
| 6.1 | Crear una versión en **Pruebas internas** con el AAB y tu propia cuenta (y 2-3 de confianza) como testers. | [TÚ] | Hasta 100 testers, sale en minutos u horas. Sirve para las pruebas de 4.12 y para sacar las huellas de 4.10. No cuenta para el requisito de la Fase 7. |

---

## Fase 7. Prueba cerrada obligatoria (cuentas personales nuevas)

Las cuentas personales creadas **después del 13-nov-2023** tienen que hacer una prueba cerrada antes de poder publicar en
producción. Lo vigente según la ayuda de Google (desde dic-2024): **al menos 12 testers que se hayan apuntado (opt-in) y sigan
apuntados durante 14 días seguidos**. Antes eran 20. ⚠ Comprobar la cifra y los días en la Consola: puede cambiar.

| # | Paso | Quién | Nota |
|---|---|---|---|
| 7.1 | Crear una versión en **Prueba cerrada** (pista «Alpha» o una nueva) con el AAB. Pasa una revisión de Google (de horas a días). | [TÚ] | La ficha y las declaraciones de la Fase 5 tienen que estar completas. |
| 7.2 | Lista de testers: un **Grupo de Google** (lo más cómodo) o una lista de correos. Apuntar a **15-20 personas** para tener margen si alguien se borra. | [TÚ] | Necesitan cuenta de Google y un Android. Los correos de los testers no se escriben en el repo. |
| 7.3 | Mandar a los testers el **enlace de opt-in** de la Consola. Cada uno tiene que pulsar «Ser tester» y **instalar la app desde Play**. | [TÚ] | Cuenta desde que hay 12 apuntados; si bajan de 12, el contador vuelve a empezar (⚠ comprobar). |
| 7.4 | Pedirles que jueguen de verdad varios días (partido rápido, Carrera, online entre ellos) y que manden sus comentarios. Apuntar qué se cambió gracias a ellos. | [TÚ] | Google pregunta por esto en la Fase 8. |
| 7.5 | Esperar a que la Consola marque los **14 días** cumplidos. | [TÚ] | |

---

## Fase 8. Solicitar acceso a producción

Panel › «Solicitar acceso a producción». La Consola hace preguntas en tres bloques (⚠ comprobar el texto exacto). Borrador de
respuestas, para que el responsable las adapte con lo que pase de verdad en la prueba:

**Sobre la prueba cerrada**

- ¿Fue fácil encontrar testers? → «Sí. Son jugadores de vóley y amigos que ya probaban la versión web.» (adaptar)
- ¿Cómo participaron? → «Jugaron partidos rápidos, la Carrera y el online entre ellos durante las dos semanas.»
- Resumen de los comentarios → `{{RESUMEN_COMENTARIOS}}` (escribirlo con lo que digan los testers).

**Sobre la app**

- Público → «Adolescentes mayores y adultos aficionados al vóley y a los juegos de deportes.»
- ¿Qué valor aporta? → «Es un juego de vóley 3D con playa y pista, reglas reales, árbitros con señas oficiales y un modo
  Carrera largo. No tiene anuncios ni compras.»
- Instalaciones esperadas el primer año → `{{ESTIMACION}}` (una cifra prudente; no afecta a la decisión).

**Preparación para producción**

- ¿Qué cambiaste tras la prueba? → `{{CAMBIOS_TRAS_PRUEBA}}` (las mejoras se publican en la web; la app las recibe sola).
- ¿Cómo sabes que está lista? → «Pasó la prueba cerrada sin fallos graves, se probó en varios móviles Android y la versión
  web lleva semanas publicada.»

La respuesta de Google suele tardar unos días (⚠ hasta 7 o más). Si la rechaza, dice por qué y se puede repetir.

---

## Fase 9. Producción

| # | Paso | Quién | Nota |
|---|---|---|---|
| 9.1 | Crear la versión de **Producción** (puede ser el mismo AAB de la prueba cerrada) con las novedades (máx. 500 caracteres por idioma). | [TÚ] | Las novedades se pueden sacar de `VB.CHANGELOG[0]` (ficha.md §5.5). |
| 9.2 | Elegir países y, si se quiere, **lanzamiento por fases** (porcentaje de usuarios). | [TÚ] | |
| 9.3 | Enviar a revisión. | [TÚ] | La primera revisión puede tardar días. |
| 9.4 | Tras publicar: mirar el informe previo al lanzamiento, Android vitals y las reseñas. | [TÚ] | |

---

## Fase 10. Después de publicar (mantenimiento)

- **El juego se actualiza por la web**: subir otro AAB solo hace falta para cambiar algo de la TWA (icono, nombre, paquete,
  orientación, nivel de API) o cuando Google sube el API objetivo mínimo (cada año, normalmente en agosto). ⚠ Comprobar avisos
  en la Consola.
- **Cada cambio en los datos** (encender el TURN, chat rápido, quitar el uid de las salas, interruptor del netlog…) → revisar
  seguridad-datos.md, la política y, si cambia la interacción entre usuarios, el cuestionario IARC.
- **El dominio** takethecourt.com tiene que seguir activo y con el mismo `assetlinks.json`: si caduca, la app deja de funcionar.
- **La clave de subida** y el acceso a la cuenta de Google del proyecto: guardar las copias de 4.7.
- Si se añade publicidad o compras algún día: cambian la declaración de anuncios, Seguridad de los datos, IARC y, para compras
  digitales, es obligatorio Google Play Billing.

---

## Resumen: qué hace el responsable y qué está listo

**Solo el responsable [TÚ]**

1. Crear la cuenta personal, pagar los 25 USD y verificar identidad, teléfono y dispositivo Android.
2. Declarar si es comerciante (DSA).
3. Elegir el nombre de paquete (para siempre) y el nombre de desarrollador público.
4. Rellenar `Ferran Sanchís Armesto` y `help@takethecourt.com` en la política, la página de borrado y la ficha (con un correo del proyecto).
5. Generar y guardar la clave de subida con copia doble.
6. Decidir el público objetivo (16+ recomendado, o 13+ con casilla de edad) y qué hacer con netlogs y el id de dispositivo.
7. Crear las dos cuentas de prueba para el revisor.
8. Conseguir 12 o más testers y mantenerlos 14 días.
9. Revisar la política de privacidad (mejor con alguien que sepa de RGPD) antes de enviar.
10. Pulsar todos los botones de envío en la Consola.

**Listo en esta carpeta [LISTO]**

- Textos de la ficha es-ES y en-US con recuentos (ficha.md).
- Respuestas de Seguridad de los datos (seguridad-datos.md).
- IARC, público objetivo, anuncios, acceso a la app, declaraciones y borrador para producción (clasificacion.md y este archivo).

**Falta en el repo [CÓDIGO]**

- ~~`pages/privacidad.html`, `pages/borrar-cuenta.html` y el enlace dentro del juego.~~ Hecho (24-nov-2026).
- ~~`/.well-known/assetlinks.json` en el build.~~ Hecho (24-nov-2026): `pages/.well-known/assetlinks.json` (con dos huecos para las huellas) y build-pages copia `pages/` con subcarpetas.
- Netlogs: plazo de 90 días hecho en el código (24-nov-2026); falta activar el TTL (README «Decisiones» 3). Borrarlos con la cuenta necesitaría una Cloud Function. (Las salas ya se borran, 24-nov-2026.)
- ~~Gráfico de funciones 1024×500 y capturas.~~ Hecho: `notes/playstore/graficos/`.
- Recomendado: ~~nombre visible anónimo y filtro~~ (hecho, 24-nov-2026: js/namefilter.js), denuncia de nombres; ~~fuentes y three.js propios y service worker~~ (hecho, 24-nov-2026: `notes/offline.md`).
- ~~El proyecto de la TWA (`twa-manifest.json`), si se quiere tener en el repo (sin la clave).~~ Hecho (24-nov-2026): `android/`, ver android.md.
