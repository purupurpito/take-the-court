# Clasificación del contenido y declaraciones — Take the Court (1.22.0)

Respuestas para Play Console › **Política › Contenido de la app**: clasificación (cuestionario IARC), público objetivo y
contenido, anuncios, acceso a la app y el resto de declaraciones. Cada respuesta va con su justificación (archivo:línea de la
rama playstore). Los textos y el orden de las preguntas de IARC cambian a veces: si algo no cuadra, **comprobar en la Consola**.

---

## 1. Cuestionario de clasificación (IARC)

### 1.1 Datos iniciales

| Pregunta | Respuesta |
|---|---|
| Correo de contacto para IARC | `help@takethecourt.com` (le llegan los certificados de clasificación) |
| Categoría de la app | **Juego** |

### 1.2 Contenido

| Pregunta (resumen) | Respuesta | Justificación |
|---|---|---|
| **Violencia**: ¿hay violencia de cualquier tipo, aunque sea cartoon o fantástica? | **No** | Es vóley: no hay peleas, armas ni daño a personajes. Las lesiones de la Carrera son poco frecuentes, solo texto o estado, «tono cartoon, sin gore» (js/career-injury.js:3-15). |
| ¿Sangre o gore? | **No** | Ídem. |
| **Miedo**: ¿contenido que pueda asustar (sustos, terror)? | **No** | Ninguno. |
| **Sexualidad**: ¿desnudos, contenido sexual o insinuaciones? | **No** | Equipaciones deportivas normales. El Vestuario es solo estética (peinados, gorras, gafas, manguitos…, CHANGELOG 1.1.0 y 1.18.0). |
| **Juegos de azar**: ¿juegos de azar simulados (casino, apuestas sin dinero real)? | **No** | No hay casino, apuestas ni cajas de botín. Hay azar de juego normal: lesiones poco probables, «Al azar» del Vestuario (js/look.js:662), sorteo del reto diario y semanal. Una frase de un mensaje de la Carrera menciona «la apuesta con mi pareja» (js/career-story-msgs.js:342), sin mecánica de apuesta. |
| ¿Juego con dinero real o premios? | **No** | No hay pagos de ningún tipo. |
| **Lenguaje**: ¿palabrotas, insultos o lenguaje ofensivo? | **No** | Búsqueda de insultos y palabrotas comunes en js/*.js sin resultados. Hay protestas al árbitro, pitadas y cánticos de la grada y pique deportivo entre clubes (js/ambiente.js:1-4, :88 y :328), sin insultos. |
| **Sustancias controladas**: ¿drogas, alcohol o tabaco? | **No** | Búsqueda de alcohol, cerveza, borracho, tabaco, fumar, droga y dopaje sin resultados de contenido («copas» son competiciones). |
| **Humor grosero** (escatológico, vulgar) | **No** | Ninguno. |
| ¿Contenido que discrimina o incita al odio? | **No** | Ninguno. |
| ¿Imágenes de la vida real con violencia o contenido sensible? | **No** | Todo es 3D generado; sin fotos ni vídeos reales. |

### 1.3 Interacción y funciones (elementos interactivos)

| Pregunta (resumen) | Respuesta | Justificación |
|---|---|---|
| **¿Los usuarios pueden interactuar o intercambiar contenido con otros usuarios** (voz, texto, imágenes o audio)? | **Sí** (recomendado) | No hay chat de texto ni de voz (los mensajes del canal son de control del juego: js/net.js, js/netfluid.js, js/netlobby.js:429). Pero hay online con desconocidos y **nombres visibles de texto libre** (2-16 caracteres, js/netroom.js:52-59; lista pública de salas, firestore.rules:65-66; js/netlobby.js:889-899), y el enlace de la semana enseña apodos de amigos (js/semana.js:247-305). Contestar «Sí» añade el aviso «Los usuarios interactúan» y **no sube la edad**. Contestar «No» sería defendible (no hay comunicación), pero un revisor podría verlo como incompleto. |
| ¿Comparte la ubicación física del usuario con otros usuarios? | **No** | No usa la ubicación (inventario §F). La IP que llega al rival por WebRTC no se usa ni se enseña (js/netconfig.js:3-4). |
| ¿Comparte información personal del usuario con terceros? | **No** | Firebase es proveedor de servicio; el nombre visible lo elige y lo enseña el propio usuario al jugar online (ver seguridad-datos.md §2). Si se quiere ser conservador por el nombre visible, marcar «Sí»: añade el aviso «Comparte información», sin cambiar la edad. |
| ¿Compras digitales? | **No** | No hay pagos, suscripciones ni anuncios. La «Tienda» se paga con dinero ficticio de la Carrera (js/career.js:136 y :2640; js/career-life.js:762-783). |
| ¿Compras de objetos aleatorios (cajas de botín)? | **No** | No existen. |
| ¿Acceso sin restricciones a internet (navegador o buscador dentro de la app)? | **No** | No hay navegador ni enlaces a webs abiertas dentro del juego. Compartir usa el menú del sistema. |

### 1.4 Clasificaciones esperadas

Con estas respuestas, lo esperable es (lo decide IARC al enviar):

| Sistema | Clasificación esperada |
|---|---|
| PEGI (Europa) | **PEGI 3** |
| USK (Alemania) | **USK 0** |
| ESRB (EE. UU. y Canadá) | **E (Everyone)** |
| ClassInd (Brasil) | **L** |
| ACB (Australia) | **G** |
| IARC genérica (resto) | **3+** |

Más el aviso interactivo **«Los usuarios interactúan»** (Users Interact) si se contesta «Sí» en §1.3. En algunos sistemas la
grada con tarjetas o la tensión de los partidos no cambian nada: son deporte.

Si IARC da algo más alto (por ejemplo PEGI 7 por las lesiones), revisar la respuesta de violencia: las lesiones son texto y no se
ven, así que «No» es lo correcto.

---

## 2. Público objetivo y contenido

### 2.1 Grupos de edad objetivo

Opciones de la Consola: 5 o menos · 6-8 · 9-12 · 13-15 · 16-17 · 18 o más.

**Recomendación: marcar solo «16-17» y «18 o más».**

Motivos:

- Hay **online con desconocidos** sin chat pero con nombres libres. Desde el 24-nov-2026 el nombre por defecto es anónimo y hay
  un filtro básico de palabras (js/namefilter.js), pero no hay botón de denunciar ni de bloquear (inventario, gap 7).
- **No hay control de edad**: la cuenta se crea sin fecha de nacimiento ni verificación del correo (js/account.js:377-385).
- En España, el consentimiento para el tratamiento de datos de un menor es válido **desde los 14 años** (LOPDGDD art. 7; RGPD
  art. 8 deja a cada país entre 13 y 16). Por debajo hace falta el de los padres.
- Si se marca cualquier franja de menos de 13 años, la app entra en la **política de Familias**: requisitos de anuncios,
  SDK certificados, datos de menores y revisión más dura. No compensa.

**Edad de la cuenta frente a público de la tienda.** La política de privacidad dice que la cuenta y el online son para mayores de
**14** años (la edad legal de consentimiento en España). El público objetivo de Play recomendado (16+) es **más estricto a
propósito**: por el online con desconocidos sin denuncia ni bloqueo (el filtro de nombres es básico). No se contradicen: 14 es el mínimo legal para tener
cuenta; 16+ es a quién se dirige la ficha. Si un revisor pregunta, contestar eso. Si se prefiere una sola cifra, subir la política
a 16 (es y en, y la comprobación «14 años» de tools/policytest.js).

Alternativa «13+» (marcar 13-15, 16-17 y 18 o más): solo si antes se añade una casilla de edad al crear la cuenta o al entrar en
el online («Tengo 14 años o más» o «Tengo permiso de mi madre, padre o tutor»). El nombre visible por defecto anónimo y el filtro
básico de nombres ya están (24-nov-2026). Con 13-15 marcado, Play puede pedir más cosas del contenido para adolescentes (comprobar en la Consola).

### 2.2 ¿La ficha o la app podrían atraer sin querer a niños?

Respuesta recomendada: **No**, explicando en el campo de texto si lo pide:

```text
Es un juego de simulación de vóley con una Carrera profesional (fichajes, contratos, prensa, selección), cuatro niveles de dificultad y online con otras personas. Está pensado para adolescentes mayores y adultos aficionados al vóley. No usa personajes infantiles, no tiene contenido educativo para niños y la ficha no se dirige a ellos.
```

Ojo: el estilo es cartoon y de colores vivos. Google puede revisar la ficha y decidir que sí atrae a niños; en ese caso pediría
cumplir partes de Familias. Para reducirlo: capturas de partidos y de la Carrera (no del Vestuario con colores chillones en
primer plano) y descripción centrada en el deporte. La descripción de ficha.md ya va así.

### 2.3 Otras preguntas de esta sección

| Pregunta | Respuesta |
|---|---|
| ¿Quieres que la app forme parte del programa «Aprobado por profesores» / Familias? | **No** |
| ¿Contenido generado por usuarios? | Solo el nombre visible y el nombre del personaje (ver §6 sobre la política de contenido generado por usuarios). |

---

## 3. Anuncios

| Pregunta | Respuesta | Justificación |
|---|---|---|
| ¿Tu app contiene anuncios? | **No** | No hay SDK de anuncios ni enlaces patrocinados. Búsqueda de gtag, analytics, ads: sin resultados (inventario §F). Los «patrocinadores» de la Carrera son ficticios y parte del juego (js/version.js, CREDITS.note). |
| ID de publicidad (declaración aparte para apps con targetSdk 33+) | **No usa el ID de publicidad** | La TWA de Bubblewrap no añade el permiso `AD_ID`. Comprobar en el `AndroidManifest.xml` generado que no está. |

---

## 4. Acceso a la app (instrucciones para el revisor)

Respuesta: **«Parte de la funcionalidad está restringida»** (el online pide cuenta).

Texto para pegar (es-ES; la Consola acepta español, pero se recomienda inglés para el revisor: hay versión debajo):

```text
Todo el juego se puede probar sin cuenta: Jugar ya, Partido rápido (2 contra 2 de playa y pista, 6 contra 6), Carrera, Entrenamiento, Retos y Vestuario.

La cuenta es opcional y solo hace falta para guardar en la nube y para el online (beta).
Cuenta de prueba 1: usuario {{USUARIO_PRUEBA_1}} / contraseña {{CLAVE_PRUEBA_1}}
Cuenta de prueba 2: usuario {{USUARIO_PRUEBA_2}} / contraseña {{CLAVE_PRUEBA_2}}
Para entrar: portada › Cuenta › pestaña «Entrar» › escribe el usuario en «Correo o usuario» y la contraseña › Entrar.

Para probar el online hacen falta dos dispositivos (o un dispositivo y un navegador en https://takethecourt.com):
1. En el primero, entra con la cuenta 1 › Online › Crear sala. Apunta el código de 6 caracteres.
2. En el segundo, entra con la cuenta 2 › Online › Entrar con código (o elige la sala en la lista).
3. El partido empieza solo. Cada persona lleva a su jugador; la IA hace de pareja.

Para borrar una cuenta: Cuenta › Borrar la cuenta › Sí, borrar la cuenta. Por favor, no borres las cuentas de prueba.
```

```text
The whole game can be tested without an account: Play now, Quick match (2v2 beach and indoor, 6v6), Career, Training, Challenges and Locker room. The game is in Spanish.

An account is optional. It is only needed for cloud saves and for online play (beta).
Test account 1: username {{USUARIO_PRUEBA_1}} / password {{CLAVE_PRUEBA_1}}
Test account 2: username {{USUARIO_PRUEBA_2}} / password {{CLAVE_PRUEBA_2}}
To sign in: home screen › Cuenta › «Entrar» tab › type the username in «Correo o usuario» and the password › Entrar.

Online play needs two devices (or one device and a browser at https://takethecourt.com):
1. On the first one, sign in with account 1 › Online › Crear sala. Note the 6-character code.
2. On the second one, sign in with account 2 › Online › Entrar con código (or pick the room from the list).
3. The match starts automatically. Each person controls one player; the AI is the partner.

To delete an account: Cuenta › Borrar la cuenta › Sí, borrar la cuenta. Please do not delete the test accounts.
```

**Antes de pegarlo, comprobar en el juego** los nombres exactos de los botones (comprobados en el código de 1.22.0: pestaña «Entrar»,
campo «Correo o usuario», «Crear sala», «Entrar con código», código de 6 caracteres, js/account.js:712-720 y
js/netroom.js:47-48) y corregir el texto si cambian. Comprobar también que el botón de la portada se llama «Cuenta» y el del
online «Online». Las dos cuentas de prueba las crea el responsable desde el juego
(usuario y contraseña, sin correo real) y no deben llevar progreso personal.

---

## 5. Resto de declaraciones de «Contenido de la app»

| Declaración | Respuesta | Nota |
|---|---|---|
| Política de privacidad | `https://takethecourt.com/privacidad.html` | La página tiene que existir y ser accesible sin sesión antes de enviar. Además hace falta un enlace dentro del juego (Ajustes › Info o Cuenta). |
| Anuncios | **No** | §3 |
| Acceso a la app | Restringida en parte | §4 |
| Clasificación del contenido | Cuestionario IARC | §1 |
| Público objetivo y contenido | 16-17 y 18+ | §2 |
| Seguridad de los datos | Ver seguridad-datos.md | |
| Borrado de cuentas | `https://takethecourt.com/borrar-cuenta.html` | Se pregunta dentro de Seguridad de los datos. |
| App de noticias | **No** | No publica noticias reales (las «noticias» de la Carrera son ficticias). |
| Apps de COVID-19 (rastreo de contactos o estado) | **No** | Si la Consola ya no muestra esta declaración, nada que hacer. |
| Apps gubernamentales | **No** | No representa a ningún organismo. |
| Funciones financieras | **No / Mi app no ofrece funciones financieras** | Solo dinero ficticio de juego. |
| Apps de salud / Health Connect | **No** | No trata datos de salud ni de actividad física. |
| Permisos sensibles (fotos y vídeos, ubicación en segundo plano, alarmas exactas, servicios en primer plano, intents a pantalla completa, accesibilidad, VPN) | **No aplica** | La TWA no debe pedirlos. Al generar con Bubblewrap, **desactivar** la delegación de notificaciones y de ubicación para que no añada `POST_NOTIFICATIONS` ni permisos de ubicación. |
| Juegos con dinero real, sorteos, concursos | **No** | |
| Contenido generado por usuarios | Ver §6 | |

---

## 6. Contenido generado por usuarios (política de UGC de Play)

Lo único que un usuario puede hacer visible a otros es un **nombre** de 2-16 caracteres (nombre visible del online; si no escribe
uno, «Jugador NNNN»). No hay chat, fotos ni perfiles.

La política de UGC de Play pide, para el contenido que ven otros usuarios: condiciones que prohíban lo inaceptable, una forma de
denunciar y de bloquear, y moderación razonable. Para un apodo sin chat el riesgo es bajo. Mínimo recomendado antes de publicar:

1. ~~Nombre visible por defecto anónimo~~ **Hecho (24-nov-2026):** «Jugador NNNN», el mismo en el aparato
   (`make-the-cut.anon`, js/namefilter.js `anonName`); ya no el usuario de la cuenta ni el nombre del personaje. Solo sale otro
   nombre si el jugador lo escribe en «Tu nombre en el online» (js/netlobby.js `myName`).
2. ~~Filtro básico de palabras~~ **Hecho (24-nov-2026):** js/namefilter.js (lista corta en español, catalán e inglés; tildes,
   números como letras, letras repetidas y separadores). Rechaza tu nombre («Ese nombre no vale: elige otro.») y enseña como
   «Jugador NNNN» los nombres con insultos que llegan de otros (salas, saludo, récord online, enlace de la semana), así un
   cliente modificado tampoco los enseña. Es básico: no entiende contexto ni otros alfabetos. tools/nametest.js lo prueba con
   insultos y con más de 400 nombres y palabras normales.
3. **Ocultar o denunciar** (pendiente) el nombre del rival: botón «Ocultar nombres de rivales» en Ajustes o «Denunciar nombre» en la hoja
   final, con envío a `help@takethecourt.com` o a una colección de Firestore.
4. Una línea en la política de privacidad: ya dice «No pongas tu nombre real ni otros datos personales», que hay un filtro
   básico y que se puede avisar por correo de un nombre ofensivo. Falta, si se quiere, «Podemos cambiar o borrar nombres que no
   cumplan esto» (hoy no hay forma de hacerlo desde el servidor: el nombre va en la sala, que dura lo que dura).

Si se publica sin esto, contestar con honestidad si Play pregunta y tenerlo como primera mejora tras el lanzamiento.
