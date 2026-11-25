# App de Android (TWA) — pasos para el responsable

La app de Google Play es una **Trusted Web Activity (TWA)**: una app pequeña que abre `https://takethecourt.com` en Chrome a
pantalla completa, sin barra de direcciones. El juego sigue siendo la web: **cada publicación de la web llega sola a la app**.
La app solo hay que volver a subirla cuando cambia algo de la propia app (ver §8).

Lo que ya está en el repo (rama playstore, 24-nov-2026):

| Archivo | Qué es |
|---|---|
| `android/twa-manifest.json` | Configuración de Bubblewrap: paquete, nombre, colores, iconos, orientación, versión. Es lo único que se edita a mano. |
| `android/` (resto) | Proyecto de Android generado por Bubblewrap 1.27 a partir del anterior (gradle, Java, iconos y pantalla de arranque). No se edita a mano: se regenera con `bubblewrap update`. |
| `android/manifest-checksum.txt` | Huella del `twa-manifest.json`. Si no coincide, `bubblewrap build` pregunta si regenerar el proyecto. |
| `android/.gitignore` | Deja fuera claves (`*.keystore`, `*.jks`), compilados (`*.aab`, `*.apk`, `build/`, `.gradle/`) y `local.properties`. |
| `pages/.well-known/assetlinks.json` | Lo que demuestra a Android que la web y la app son del mismo dueño. Se publica en `https://takethecourt.com/.well-known/assetlinks.json` (lo copia `tools/build-pages.js`). Lleva **dos huecos** para las huellas. |
| `tools/twatest.js` | Prueba que todo cuadra (paquete, colores y orientación iguales que la web, sin claves en el repo, assetlinks en el build). `STRICT_TWA=1` falla si quedan huecos. |

Valores elegidos (cambiarlos en `android/twa-manifest.json` **antes** de la primera subida; luego, `bubblewrap update`):

| Campo | Valor | Nota |
|---|---|---|
| `packageId` | `com.takethecourt.app` | **No se puede cambiar nunca** tras la primera subida. Si se elige otro, cambiarlo también en `pages/.well-known/assetlinks.json` (twatest lo comprueba). |
| `host` / `startUrl` | `takethecourt.com` / `/` | |
| `name` / `launcherName` | Take the Court | El nombre bajo el icono del móvil. |
| `display` / `orientation` | `fullscreen` / `landscape` | Igual que el manifest de la web: el juego es apaisado en el móvil. |
| Colores | `#070B14` (tema, navegación y fondo de la pantalla de arranque) | `theme_color` y `background_color` de la web. |
| Icono | `https://takethecourt.com/icon-512.png` | |
| Icono adaptable (máscara) | `https://takethecourt.com/icon-maskable.png` | Es `notes/playstore/graficos/icono-512.png` (dibujo al 82 %). Ya está copiado en `pages/icon-maskable.png` y el manifest de la web lo anuncia como `maskable` (build-pages). Hay que **publicar la web** antes del primer `bubblewrap update` (lo baja de takethecourt.com). twatest falla si falta o si no es igual a `icono-512.png`. |
| Notificaciones / ubicación / Play Billing | No / no / no | La app no pide permisos sensibles. |
| `fallbackType` | `customtabs` | Si Chrome no puede abrir la TWA, abre una pestaña personalizada (no un WebView). |
| `appVersionCode` / `appVersionName` | `1` / `1.0.0` | Es la versión **de la app de Android**, no la del juego (1.22.0…). Solo sube al subir otro AAB. |
| `minSdkVersion` | 24 (Android 7.0) | El de Bubblewrap por defecto es 21, pero su propia librería (androidbrowserhelper 2.7.4) pide 24 y con 21 no compila. |
| `targetSdkVersion` | 36 (Android 16) | Lo pone la plantilla de Bubblewrap 1.27. ⚠ Comprobar en la Consola el mínimo del año (checklist 4.5). |
| `signingKey` | `{{RUTA_FUERA_DEL_REPO}}/take-the-court-subida.keystore`, alias `subida` | Hueco a propósito: la ruta se pasa al compilar (§4) para no tocar el manifest. |

En este PC ya se compiló una prueba (fuera del repo, con la clave de depuración de Android en `~/.android/debug.keystore`):
`app-debug.apk` (6,1 MB) y el AAB sin firmar (1,9 MB) salen bien; el APK es `com.takethecourt.app` 1.0.0, API 24-36, sin permisos.

---

## 1. Requisitos (una vez)

1. **Node** (ya está) y **Bubblewrap**: `npm i -g @bubblewrap/cli`.
2. **JDK 17** y **Android SDK**: Bubblewrap los descarga la primera vez que se usa y guarda dónde están en
   `~/.bubblewrap/config.json`. En este PC ya están: JDK en `C:/Program Files/Java/jdk-17` y SDK en
   `%LOCALAPPDATA%/bubblewrap-sdk`.
3. Comprobarlo: `bubblewrap doctor` (tiene que decir que el JDK y el SDK están bien). ⚠ La versión de JDK que pide Bubblewrap
   puede cambiar con versiones nuevas.

## 2. Crear la clave de subida (una vez, la guardas tú)

Con Play App Signing (obligatorio en apps nuevas) hay **dos claves**:

- **Clave de firma de la app**: la crea y la guarda Google. Es la que firma lo que se instala en los móviles.
- **Clave de subida** (*upload key*): la tuya. Firma el AAB que subes a la Consola para demostrar que eres tú.

Crear la de subida en una carpeta **fuera del repo y sin espacios en la ruta** (Bubblewrap no la entrecomilla), por ejemplo
`C:\claves-ttc\`:

```
mkdir C:\claves-ttc
keytool -genkeypair -v -keystore C:\claves-ttc\take-the-court-subida.keystore -alias subida -keyalg RSA -keysize 2048 -validity 10000
```

(`keytool` está en `C:\Program Files\Java\jdk-17\bin\`.) Pide una contraseña del almacén, tu nombre y ciudad (pueden ser los
de un estudio) y la contraseña de la clave. `-validity 10000` son unos 27 años (Play pide que la clave valga al menos hasta el 22-oct-2033; ⚠ comprobar).

**Copia de seguridad, en dos sitios distintos** (por ejemplo, gestor de contraseñas con el archivo adjunto + disco o USB cifrado):
el archivo `.keystore`, el alias `subida` y las **dos contraseñas**. Si se pierde, con Play App Signing se puede pedir a Google
que acepte otra clave de subida, pero tarda días.

**Nunca** en git ni dentro de la carpeta del repo (aunque `android/.gitignore` la ignoraría, y twatest falla si encuentra una).

## 3. Primera vez en la Consola: crear la app y activar Play App Signing

1. Play Console › «Crear app» (checklist Fase 3).
2. Al crear la primera versión (Pruebas internas o Prueba cerrada) la Consola ofrece **Play App Signing**: aceptar «Usar la clave
   generada por Google». ⚠ Comprobar el texto exacto en la Consola.

## 4. Compilar el AAB

Desde la carpeta `android/` del repo:

Lo más sencillo es NO poner las contraseñas en ninguna variable: Bubblewrap pregunta las dos al firmar.

```
cd android
bubblewrap build --signingKeyPath=C:\claves-ttc\take-the-court-subida.keystore --signingKeyAlias=subida
```

Si prefieres dejarlas puestas para esa ventana (no se guardan en ningún archivo), antes del `bubblewrap build`:

- En **PowerShell** (la de siempre en este PC):
  ```
  $env:BUBBLEWRAP_KEYSTORE_PASSWORD = 'tu-contraseña-del-almacén'
  $env:BUBBLEWRAP_KEY_PASSWORD = 'tu-contraseña-de-la-clave'
  ```
- En **cmd** (todo lo que va detrás del `=` es la contraseña: sin espacios ni comentarios al final):
  ```
  set BUBBLEWRAP_KEYSTORE_PASSWORD=tu-contraseña-del-almacén
  set BUBBLEWRAP_KEY_PASSWORD=tu-contraseña-de-la-clave
  ```

Sale `android/app-release-bundle.aab` (el que se sube a Play) y `android/app-release-signed.apk` (para instalarlo a mano en un
móvil). Los dos están en el `.gitignore`. Si Bubblewrap pregunta «twa-manifest.json has changed, update project?», es que alguien
tocó el manifest sin regenerar: contestar que sí (ver §8).

## 5. Las dos huellas SHA-256 → assetlinks.json

1. **Huella de la clave de subida** (la tuya):
   ```
   keytool -list -v -keystore C:\claves-ttc\take-the-court-subida.keystore -alias subida
   ```
   Copiar la línea `SHA256:` (formato `AB:CD:…`, 32 pares).
2. **Huella de la clave de firma de la app** (la de Google): Play Console › la app › Probar y publicar › Configuración ›
   **Integridad de la app** › Firma de apps › «Certificado de la clave de firma de la app» › SHA-256. Esa misma página enseña
   también la de subida y un bloque «Digital Asset Links JSON» ya hecho. ⚠ El menú puede llamarse distinto.
3. Pegarlas en `pages/.well-known/assetlinks.json` en lugar de `{{SHA256_FIRMA_APP_PLAY}}` y `{{SHA256_CLAVE_SUBIDA}}`
   (en mayúsculas y con los dos puntos, tal cual las dan).
4. `STRICT_TWA=1 node tools/twatest.js` tiene que dar TODO OK (sin huecos y con el formato bien).
5. Publicar la web (como siempre). Comprobar:
   ```
   curl -i https://takethecourt.com/.well-known/assetlinks.json
   ```
   Tiene que dar `200`, `content-type: application/json` y sin redirecciones.

La huella de la clave de firma de Google es la que cuenta en los móviles que instalan desde Play; la de subida sirve para
probar el APK firmado por ti (`app-release-signed.apk`). Por eso van las dos.

## 6. Subir a la prueba cerrada

1. Play Console › Probar y publicar › Pruebas › **Prueba cerrada** › crear versión › subir `app-release-bundle.aab`.
2. Notas de la versión (máx. 500 caracteres), revisar y enviar. La revisión de Google tarda de horas a días.
3. Lista de testers y enlace de opt-in: checklist Fase 7 (12 testers 14 días seguidos; ⚠ comprobar la cifra en la Consola).

(Antes se puede subir el mismo AAB a **Pruebas internas** para probarlo en tu móvil en minutos; checklist Fase 6.)

## 7. Comprobar Digital Asset Links

- Herramienta de Google: https://developers.google.com/digital-asset-links/tools/generator — dominio `https://takethecourt.com`,
  paquete `com.takethecourt.app` y la huella SHA-256 de la firma de Play → «Test statement».
- O directamente:
  `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://takethecourt.com&relation=delegate_permission/common.handle_all_urls`
- En el móvil: instalar desde Play (prueba interna o cerrada). Si se abre **con la barra de direcciones de Chrome arriba**, la
  verificación ha fallado: revisar huellas, paquete y que la web publicada tenga el `assetlinks.json` nuevo (la caché de Google
  puede tardar un rato). Si se abre a pantalla completa, está bien.
- Las demás pruebas en el móvil real: checklist 4.12.

## 8. Actualizar la app más adelante

- **Cambios del juego**: no hay que hacer nada en Android. Se publica la web y la app los recibe al abrirse (aviso de versión
  nueva de js/update.js).
- **Otro AAB solo hace falta** si cambia algo de la app: nombre, icono, colores, orientación, dominios adicionales,
  o cuando Google sube el `targetSdkVersion` mínimo (normalmente cada agosto; ⚠ la Consola avisa).
- Pasos:
  1. Editar `android/twa-manifest.json` si cambia algo (y publicar antes en la web los iconos nuevos, porque `update` los descarga
     de takethecourt.com).
  2. `cd android` y `bubblewrap update --appVersionName=1.0.1` (sube solo `appVersionCode` en 1 y regenera el proyecto y
     `manifest-checksum.txt`). Para subir el SDK objetivo, actualizar antes Bubblewrap (`npm i -g @bubblewrap/cli`).
  3. `node tools/twatest.js` (desde la raíz del repo).
  4. `bubblewrap build` como en §4 y subir el AAB nuevo a la pista que toque.
  5. Commit de `android/` (nunca la clave ni los `.aab`/`.apk`).
- El `assetlinks.json` no cambia al actualizar (las claves son las mismas). Si algún día se cambia la clave de subida, añadir la
  huella nueva sin quitar la de Google.
- **El dominio** takethecourt.com tiene que seguir activo y sirviendo el mismo `assetlinks.json`: si no, la app enseña la barra de
  direcciones o deja de funcionar.

## Problemas conocidos

- `bubblewrap build --signingKeyPath=...` no admite espacios en la ruta: guardar la clave en una ruta sin espacios.
- Con la clave de depuración (APK de prueba compilado con gradle), la verificación falla y sale la barra de direcciones: es lo
  normal; para probar a pantalla completa, usar el APK firmado con la clave de subida (su huella ya está en assetlinks) o la
  versión de Play.
- Si el icono adaptable recorta la «T» en algún lanzador, retocar `ICON_SCALE` en `tools/storeshots.js`, volver a sacar
  `icono-512.png`, copiarlo a `pages/icon-maskable.png` (twatest comprueba que son iguales), publicar y `bubblewrap update`.
