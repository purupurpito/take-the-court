# Plan del Vestuario: personalización «perfecta» (rama personaje, desde 1.15.1)

19-nov-2026. Este plan sale de una auditoría sin cambios en js/, index.html ni en ningún archivo existente. Para la auditoría se hicieron capturas con herramientas nuevas en tools/ y todas las salidas están en tools/out/, que git ignora.

Lo que pidió Ferran: «hay muchas cosas que no se ven, pocas opciones de pelo, capas mal hechas… que quede PERFECTO».

Condiciones de partida:
- El dispositivo principal es el móvil. Se prueba siempre a 568x320, 640x360 y 360x640.
- Los menús siguen el estilo SPLAT (notes/splat.md).

---

## 1. Diagnóstico

El hecho que lo condiciona todo: **en el partido tu jugador se ve casi siempre DE ESPALDAS y desde arriba**.
- En el móvil, en pista, mide unos 98 px de alto, con la malla media (LOD1) y un atlas de 512².
- Por eso hoy la nuca, la parte de arriba de la cabeza y la cara exterior de brazos y piernas son lo que más se ve. Y son justo lo peor hecho.
- Pruebas: tools/out/look-audit/game-distance/hall-mobile-11.jpg, hall-mobile-12.jpg, beach-mobile-03.jpg y beach-mobile-08.jpg.

### 1.1 Pelo («capas mal hechas» y «pocas opciones»)

He comprobado yo mismo el código y la hoja tools/out/look-audit/hair/hair-coleta-hall.jpg. Los 10 peinados se construyen sobre un mismo casquete, `cap()` (doll.js:1163): un trozo de esfera cortado por un plano, centrado en z −0,012 y girado. De ahí salen estos fallos:

| # | Fallo | Causa (archivo:línea) | Prueba |
|---|---|---|---|
| H1 | **Nuca calva bajo un corte recto** en los 10 peinados, en pista y en playa. Parece un gorro de piscina | thetaLength 0,37–0,5π y rot −0,1/−0,25: el borde de atrás queda a la altura del centro de la cabeza (doll.js:1163, 1180-1240) | hair/hair-*-hall.jpg, vistas de espalda; vestux/peinados-hoja.png |
| H2 | **Línea del pelo dentada y cejas «mordidas»** (lo peor, en rapado y cresta) | el casquete es un elipsoide y la cabeza es `headShape` (doll.js:296), con la frente plana. La holgura por delante es ≈0 o negativa. k 0,985 atraviesa la lámina de la cara (F_OFF 0,002, doll.js:326) | look-audit/hair-crops/rapado-front.png; lookaudit/zoom-rapado-q.png |
| H3 | **La coleta no tiene cola sin gorra**: va dentro del cráneo | doll.js:1347: `dy = dz = 0` si no hay gorra, sin FK y sin sacarla del cráneo chibi (RZ 0,235) | hair-coleta-hall.jpg, vista de espalda: solo asoma una cuña |
| H4 | **La coleta lleva un aro del equipo** que flota y brilla como una cinta (owk 0). El jugador no lo ha elegido | doll.js:1189: toro R·0,98 frente a un cráneo de ≈0,215 a esa altura | hair-coleta-hall.jpg, todas las vistas |
| H5 | **De espaldas, tupé, flequillo, rapado, cresta y moño son el mismo casco** | todo lo que distingue a cada peinado está delante o arriba | game-distance/hall-mobile-11 y -12 |
| H6 | Los mechones laterales del flequillo parecen **auriculares** | doll.js:1207: esferas aplastadas justo encima de la oreja | hair-flequillo-hall.jpg |
| H7 | El afro tiene una **cuña vertical** con una franja negra en la sien. Sus rizos parecen botones en fila | doll.js:1194 (phiStart con 2,1 rad cortados en recto) y 1197-1202 (19 esferas en 2 anillos) | hair-afro-*.jpg |
| H8 | **Las gomas de las trenzas flotan** delante de los hombros y las trenzas parecen cuerdas | doll.js:1166-1170: gomas en z −0,07 contra el final de la trenza en ≈−0,20, y sin escalar por FK | hair-trenzas-hall.jpg, c_head_beach.jpg |
| H9 | La cresta no parece una cresta: tiene los laterales llenos y sus pinchos de 3 cm desaparecen | doll.js:1233-1239 | hair-cresta-hall.jpg |
| H10 | **Con gorra/pescador, la nuca queda calva**: el «pelo de gorra» va entero dentro del gorro | doll.js:1242 (θ 0,44π, k 0,99, dentro de la copa θ 0,46π R+0,012) | combos/c_head_beach*.jpg |
| H11 | Hay 6 de los 15 colores naturales casi negros e iguales entre sí. El pelo oscuro sobre piel oscura no tiene volumen | look.js:51-53; color plano por vértice, sin brillo | hair-*.jpg, fila 3 |
| H12 | Los NPC solo usan 7 peinados | players.js:323 y 4631 | — |
| H13 | Las reglas de CLASH **prohíben** combinaciones en vez de adaptar el pelo | look.js:212-219 | — |

### 1.2 Cabeza y cara (lo que «no se ve»)

| # | Fallo | Causa | Prueba |
|---|---|---|---|
| C1 | cinta, cintaRizo y bandana **flotan como un halo** y son casi iguales. El filete de la cinta es invisible porque queda dentro del toro | doll.js:1276-1280: toro circular R+0,004 a dy≈0,4, donde la cabeza mide ≈0,92·RX y es elíptica. El filete (tubo 0,0107) va dentro del tubo 0,0238 | head/head-cinta-*.jpg, head-bandana-*.jpg |
| C2 | Las viseras de gorra, gorraMTC y gorraAtras se ven como una **raya negra** («uniceja»). Desde abajo desaparecen porque son de una sola cara | doll.js:1258-1259: media esfera sin cara inferior, de 0,016 de alto, en cB, con tinta completa | head/head-gorra-*.jpg |
| C3 | La visera tiene la cara inferior negra y una banda que flota | doll.js:1268-1275 | head/head-visera-beach.jpg |
| C4 | Las gafas «oscuras» no son oscuras y las de «espejo» parecen ojos verdes | doll.js:757-761 (alfa 0,45 / 0,55); montura 0xa7adb8 (doll.js:737) | head/eyes-oscuras-beach.jpg, eyes-espejo-beach.jpg |
| C5 | Las gafas en la frente se **entierran en el pelo**, sus patillas parecen antenas y se ven a través de la gorraAtras | doll.js:1304-1314; CLASH no las compara con el pelo (look.js:213) | head/eyes-frente-beach.jpg, combos/c_head_beach3.jpg |
| C6 | **La pintura y las marcas son diminutas** (zinc, rayas, pecas, tirita) | `cheekClip` las deja por encima de CHEEK_Y, es decir, debajo de los discos de los ojos (doll.js:672-731). La mejilla libre está en la lámina de la boca y no se usa | head/paint-*.jpg, marks-*.jpg; lookaudit/sheet-face.png |
| C7 | El bigote pone la cara triste, la perilla parece una «O» y en piel oscura las barbas desaparecen | doll.js:836-870 | head/beard-*.jpg |
| C8 | La corona **flota** sobre el tupé y es pequeña | doll.js:1293-1294 | combos y lookaudit/combo-tupe+corona.png |
| C9 | Los halos de piel oscura caen dentro del solape de las láminas: z-fighting bajo los ojos | doll.js:779 (halo hasta dy −0,33) y 873 (hasta −0,305); solape −0,36..−0,30 | zoom de la cara en LOD0 |
| C10 | F_OFF 2 mm es poco para la rejilla de la lámina en LOD0: la piel atraviesa ojos y boca en calidad baja | doll.js:326, 1338 | — |
| C11 | El «MTC» de la gorra MTC se lee deformado y la visera lo corta | doll.js:1137-1152 | head/head-gorraMTC-*.jpg |
| C12 | **Ningún objeto de la cara se ve en el partido** (siempre de espaldas) | diseño | game-distance/beach-mobile-03.jpg |

### 1.3 Torso y brazos

| # | Fallo | Causa | Prueba |
|---|---|---|---|
| T1 | **La licra (playa) está rota**: solo se ven dos hombreras negras | doll.js:582: la manga 0–0,38 queda debajo de la bola del hombro (cubre ≈40 % arriba); doll.js:415 la tapa la camiseta de tirantes | torso/under-licra-beach.jpg, combos/c_torso_beach.jpg |
| T2 | En el partido desaparecen muñequera, reloj, dedos, kinesio, medalla, conchas, brazalete y munhCanon | piezas finas; el cuello solo se ve por delante | game-distance/hall-mobile-06/07 |
| T3 | manguitoRayos con kit B: rayo amarillo sobre fondo amarillo | doll.js:539-542, color fijo 0xffd23a | torso/arm-manguitoRayos-hall.jpg |
| T4 | Los dedos no se ven sobre piel clara (TAPE 0xf4f2ea) | doll.js:153 | torso/hands-dedos-*.jpg |
| T5 | El kinesio solo se ve de lado | doll.js:588-596 | torso/arm-kinesio-*.jpg |
| T6 | La térmica parece un manguito en cB. No tiene cuello y con manguitos desaparece del todo | doll.js:584/586 | torso/under-termica-hall.jpg |
| T7 | El manguitoOro no parece oro (con kit B es igual al manguito normal) | doll.js:509-512 | torso/arm-manguitoOro-hall.jpg |
| T8 | Choques de mismo color: coderas sobre manguito, brazalete sobre manguito, brazalete pegado al ribete | doll.js:1015-1016, 602-603 | combos/c_torso_hall*.jpg |
| T9 | Los mitones parecen guantes de boxeo; la medalla es diminuta y su cinta se confunde con el cuello | doll.js:1048, 1124-1127 | torso/hands-mitones-beach.jpg, neck-medalla-*.jpg |
| T10 | La muñequera parece una pulsera fina (tubo 0,014) | doll.js:1032 | torso/wrist-muneq-*.jpg |

### 1.4 Piernas y pies (lo que «no se ve» de verdad)

| # | Fallo | Causa | Prueba |
|---|---|---|---|
| P1 | **La tobillera `blanca` nunca se ve**: queda dentro del empeine. En pista la ranura no hace nada | doll.js:1109 (cilindro y −0,06..0) y 1111 (ribete y −0,012), dentro de la media esfera del empeine (su parte de arriba ≈ +0,049). Comprobado | legs/ankle-blanca-hall.jpg, idéntica a la base |
| P2 | **`pulseraTob` no se ve y cuesta 160 triángulos**. `tela` y `tobiPulpo` solo asoman como una raya en el talón | doll.js:1089-1095, dentro del empeine descalzo (parte de arriba +0,017) | legs/ankle-*-beach.jpg |
| P3 | Los calcetines `tobilleros` son iguales que no llevar calcetines; la `media` apenas se ve; `desparejados` casi no se nota | doll.js:626-631: el zapatón tapa ≈19 % de la espinilla | legs/socks-*.jpg |
| P4 | Las rodilleras `altas` son iguales que las `cortas`; las ventosas del pulpo quedan tapadas | doll.js:620/637: las bandas quedan dentro de la bola de la rodilla | legs/knees-*.jpg |
| P5 | La `malla` es del mismo color que el pantalón (no se ve) | doll.js:618 | legs/legs-malla-*.jpg |
| P6 | Las rodilleras desaparecen con mallaLarga (negro sobre negro); `bajadas` es una banda plana | tc.pad casi negro; doll.js:633/639 | combos/c_legs_hall2.jpg |
| P7 | Las 4 zapatillas tienen la misma forma. La puntera tiene el borde en escalera porque son dos esferas que se cortan. La puntera neon con kit B no se ve. Las doradas no parecen oro | doll.js:1104-1108 | legs/shoes-*.jpg |

### 1.5 Interfaz del Vestuario (ui.js 4048-4686)

| # | Fallo | Prueba |
|---|---|---|
| U1 | En el móvil la vista previa usa **atlas de 512² (px=1) y la malla de la calidad activa** (LOD1): casquetes facetados y píxeles justo donde se personaliza. Comprobado en ui.js:4108 y doll.js:1761 | — |
| U2 | **Encuadre por pestaña, no por ranura**: no se ve la tobillera, ni la coleta (no gira a la espalda), ni la gorra de perfil | vestux/568x320/hall-piernas-altosRayas.png, beach-cabeza-gorra.png |
| U3 | **En vertical (360x640) la interfaz tapa el muñeco** (las piernas quedan bajo las pestañas, la coronilla bajo el título). ⟲ ⟳ quedan debajo de «Volver» | vestux/360x640/*.png, metrics.json |
| U4 | Las filas de color no dicen qué pintan y se pueden cambiar sin efecto. El color de calcetín está oculto en playa aunque los escarpines lo usan (ui.js:4158) | vestux/640x360/hall-colores.png |
| U5 | Solo hay flechas ‹ ›: unos 55-60 toques para un look completo, sin ver las opciones de alrededor | — |
| U6 | El carril de pestañas no cabe (3 de 7 a 568x320) y algunos iconos no se entienden | vestux/568x320/*.png |
| U7 | Lo bloqueado no se explica en apaisado | vestux/568x320/bloqueado-cresta.png |
| U8 | La hoja «⋯» se corta y tiene dos botones de cerrar | vestux/568x320/mas.png |
| U9 | Todo objeto común lleva «★». Los textos son secos («Nada»). Letra de 10,9-12 px | — |
| U10 | El Vestuario de playa tiene fondo de pabellón | vestux/1280x720/beach-*.png |
| U11 | «Probar» deja el muñeco pequeño y lejos | vestux/640x360/probar.png |

### 1.6 Datos desfasados y presupuesto
- doll.js STYLES/ACCS (118-119) y players.js STYLES (323) están viejos. Los `tris` del catálogo de look.js para dosmonos, coletas y cresta también. notes/players.md dice geo:false para licra y mallaLarga, pero el código tiene vc:'B'.
- **Margen de triángulos casi nulo**: el peor caso de playa en LOD0 es 4306/4400 (TRI_CAP, doll.js:1923). Cualquier pelo más pesado rompe lookSelfTest si antes no se libera presupuesto (ver §3.2).
- Sincronización: firebase/firestore.rules guarda 'look' como texto JSON y **no valida ids**, así que los objetos nuevos no necesitan cambiar reglas. El riesgo está en `sane()` de los clientes viejos (ver §3.4).

---

## 2. Paquetes de trabajo (WP)

Cada WP lo puede hacer un agente implementador.

**Ramas.** Todo va en la rama `personaje`. Cada WP se hace en su propio worktree o subrama y lo integra el jefe.

**Orden y paralelismo.** Lo marca qué zonas de js/doll.js toca cada WP:

| Zona de doll.js | Líneas | WP |
|---|---|---|
| Z-head (headGeo, crownGeo, faceGeo, eyesGeo, paintEyes, paintGlasses, paintPaint, paintMarks, paintBeard, láminas de cara) | 296-376, 660-910, 1137-1360 | WP2 → WP3 (en serie) |
| Z-limb (paintBody, paintLimbs, sleeveFill) | 403-640 | WP4 → WP5 (en serie, misma función) |
| Z-geo-body (shoulderGeo…shoeGeo, neckGeo) | 1005-1136 | WP4 y WP5 |
| Z-preview (PV_FRAMES, pvLod, preview.*) | 1729-1900 | WP6 |
| Z-test (TRI_CAP, TRI_TODAY, lookSelfTest) | 1921-2060 | WP1 la deja preparada; cada WP solo actualiza cifras |

```
WP0 (herramientas) ──► WP1 (base: presupuesto, compatibilidad, catálogo) ──┬─► WP2 pelo ──► WP3 cabeza/cara ──┐
                                                                         ├─► WP4 piernas/pies ─► WP5 torso/brazos ┤─► WP7 objetos nuevos ─► WP8 integración y publicación
                                                                         └─► WP6 interfaz del Vestuario ────────────┘
```

- **En paralelo tras WP1:** la pista A (WP2→WP3), la pista B (WP4→WP5) y la pista C (WP6). Tocan zonas distintas de doll.js y, en ui.js, solo WP6.
- **look.js lo tocan todas las pistas.** Cada WP añade sus entradas dentro del bloque de su ranura en CATALOG y no reordena nada. El jefe resuelve los choques al integrar.
- **WP7 va después de 3 y 5**, porque reutiliza sus ayudas.

**Para todos los WP:**
- Un solo Chrome a la vez y cerrado al acabar; el PC va justo de RAM.
- Antes de lanzar `lookshots`, comprobar el espacio libre en C:. Hoy hay unos 3 GB; la herramienta se para por debajo de 250 MB. Usar `--item` para capturar solo lo que se toca.

---

### WP0. Herramientas de verificación (solo tools/)

**Objetivo.** Que «se ve / no se ve» se pueda comprobar con un número y no solo a ojo.

**Archivos:** tools/lookshots.js (ya existe y se amplía), tools/lookvis.js (nuevo), tools/looktest.js (se amplía).

**1. tools/lookvis.js: prueba de visibilidad.**
- Para cada objeto y sede renderiza el muñeco base y el muñeco con el objeto, a la misma pose y cámara, en estos casos:
  - a) primer plano del Vestuario, con el encuadre de la ranura;
  - b) distancia de partido en el móvil (640x360, dpr 2, LOD1) **de espaldas**, con la cámara del partido;
  - c) LOD0 a 6v6 lejos.
- Cuenta los píxeles que cambian (ΔE > umbral) dentro de la caja del muñeco.
- Sale `tools/out/lookvis/report.json` y una tabla con los objetos que se ven menos de N px.
- Umbrales: primer plano ≥ 1,5 % de la caja; partido en el móvil ≥ 9 px (un bloque de 3×3) para lo que se lleva en pelo, cabeza, piernas o brazos por fuera.
- Los objetos de cara (C12) solo se exigen en el primer plano, salvo que el WP les dé algo detrás.

**2. tools/lookshots.js: añadir un grupo `back`**: cabeza de espaldas y 3/4 de espaldas para todos los peinados y gorros, en una sola hoja de 10-32 casillas. Hoy cuesta comparar peinados entre hojas.

**3. tools/looktest.js:**
- `--gl --sweep` imprime el peor caso por sede y LOD con su margen respecto a TRI_CAP.
- Prueba de **ida y vuelta de guardados**: todos los fits de ejemplo de 1.15.1 (cópialos ANTES de tocar look.js a tools/fixtures/looks-1.15.1.json) pasan por sane→resolve sin perder ningún id.

**Criterios de aceptación:**
- `node tools/lookvis.js --item=pulseraTob,blanca,tobilleros,licra` marca los cuatro como INVISIBLES hoy (tiene que reproducir el diagnóstico).
- `node tools/lookvis.js --item=manguito,altos` los da como visibles.

**Riesgos.** Que salgan falsos positivos por la animación de inactividad o el parpadeo; congelarlos como en lookshots (tFix=0, sin parpadeo).

---

### WP1. Base: presupuesto, vista previa nítida, compatibilidad y catálogo

**Objetivo.** Dejar sitio (triángulos y datos) para todo lo demás sin romper guardados.

**1. Liberar triángulos sin perder aspecto** (zona Z-geo-body de doll.js):
- La puntera de la zapatilla pasa a ser `G.vc` sobre el empeine (z > umbral → color de puntera) en lugar de una media esfera que corta (doll.js:1108). Se quita P7 (el borde en escalera) y se ahorran unos 112 triángulos por pie en LOD2, y unos 50 en LOD0.
- La tobillera y el ribete (1109-1111) se recolocan por fuera del empeine (ver WP4). No se suman triángulos.
- Ojo: `G.vc` pasa la pieza a no indexada (triplica los vértices pero no los triángulos). Se aplica solo al empeine.

**2. Presupuesto y reglas** (doll.js:1921-2060):
- TRI_CAP se queda en 4400/6000/12800 para el partido: hay 12 muñecos en el 6v6 del móvil.
- `lookSelfTest` añade un informe del margen por sede y LOD, y una regla nueva: **cada peinado ≤ el afro nuevo** en todos los LOD.
- Si alguna mejora necesita más de lo que queda, solo se sube TRI_CAP de LOD1/LOD2 con una medida de fps del 6v6 a 640x360 antes y después (tools/mobaudit.js o el contador del juego), anotada en notes/players.md. **LOD0 no se sube.**

**3. La vista previa del Vestuario siempre a la máxima nitidez**:
- doll.js `pvLod()` (1761) devuelve 2 dentro del Vestuario.
- ui.js `lkPvOpts` (4108) deja de forzar px=1 en táctil. Si hay que proteger memoria, que sea px=2 en ventanas de alto ≥ 320 CSS px y px=1 solo con `ctx.quality.rank===0`.
- Es un solo muñeco: 4 MB de atlas.
- Arregla U1.

**4. Compatibilidad de guardados** (look.js `saneRaw`/`sane`/`fix`, 279-371):
- **Nunca se borra ni se renombra un id.** Los nombres visibles sí pueden cambiar (flequillo → «Tazón»).
- `saneRaw` tiene que **conservar los ids desconocidos** de ranuras conocidas en un campo `_keep: {ruta: valor}`. Al volver a guardar, se reescriben si el catálogo los conoce.
  - Esto no protege a los clientes 1.15.1 que ya están instalados (ver §3.4), pero sí a todas las versiones siguientes.
- Campos nuevos del fit: `hair2` (hex o id de tinte, por defecto ''), `hairFx` (id, por defecto ''), `cPad` (token de color, por defecto 'auto'). No hace falta subir la versión V: `sane()` rellena lo que falte.
- `geoSig` y `atlasSig` de doll.js (196-213) añaden los campos nuevos que influyen. Las firmas de look.js (401, 414) quedan alineadas con las de doll.js; hoy no coinciden, ver §0 del mapa.

**5. Catálogo:**
- Campo `fam` para los peinados ('corto' | 'medio' | 'largo' | 'recogido' | 'textura').
- Campo `uses` en las fichas de color: qué objetos usan cA, cB, cSock, cShoe, cGlass y cPad. Sirve para la UI (WP6).
- Se corrigen los `tris` desfasados.
- Se borran las copias viejas: doll STYLES/ACCS (118-119). Si alguien las lee, se sustituyen por `VB.Look`.

**Criterios de aceptación:**
- `node tools/looktest.js` y `node tools/looktest.js --gl` en verde.
- La ida y vuelta de tools/fixtures/looks-1.15.1.json no pierde nada.
- Un fit con `style:'inventado'` conserva el valor en `_keep` y se dibuja con el peinado por defecto.
- `node tools/lookshots.js legs --item=clasicas,neon,negras,doradas`: la puntera tiene un borde limpio.
- El informe de margen sale por consola.
- La captura del Vestuario a 640x360 táctil muestra LOD2 (comprobar `VB.Doll.preview` y los triángulos en la consola del Vestuario) y atlas de 1024².

**Riesgos:**
- Memoria en móviles antiguos con px=2: medir.
- `_keep` no debe crecer sin límite: solo ranuras de SLOTS, valores de texto ≤ 24 caracteres.

---

### WP2. Sistema de pelo nuevo + 22 peinados nuevos + pelo bajo gorros

**Archivos:**
- js/doll.js zona Z-head: `headGeo` 1154-1300 y la parte de la coleta en `faceGeo` 1345-1352. ITEMS.style (127), TIES (192), HIDE_HAIR (152) y TRI_TODAY.
- js/look.js: CATALOG de peinados 86-95, HAIRS 51-55, tintes 163-168, CLASH 212-219, `random` 463, `fromSeed` 431.
- js/players.js: STYLES 323 y 4631.
- js/ui.js: solo LK_UNDER_CAP 4080 (el resto de la UI es de WP6).

**Base técnica.** Detalle completo en el informe «ESTUDIO DE PELO», §1 a §6. El implementador lo sigue.

1. **`hairShell(G, col, o)`** sustituye a `cap()`.
   - Rejilla (φ, t) con sg(26,14) × sg(14,7), con las filas más densas hacia el borde.
   - Cada punto = `headShape(d)` + normal × desfase.
   - La línea de pelo depende del azimut, con perfiles HL: 'corto', 'recogido', 'tazon', 'medio', 'largo', 'afro'. Lleva entradas, patilla, arco sobre la oreja y nuca hasta θ≈0,68-0,80π.
   - Borde «tuck» de 0,0015, pegado a la piel.
   - Opciones: `vol`, `lift` (para el tupé), `flat` (cepillo), `t0` (solo la banda de la nuca, para debajo de un gorro).
   - Coste ≈ cap()+20 triángulos.
   - **Restricción de la cara:** donde |φ| < asin(FE_DX)+0,05, la línea de pelo no baja de θ_ceja − 0,02π, y el pelo queda siempre ≥ F_OFF+0,002 por fuera de la lámina.
   - Arregla H1, H2 y H10.
2. **`shellPt(o, φ, θ, extra)`**: devuelve el punto y la normal de la superficie del casco. Sirve para anclar mechones, moños, gomas, coronas y cintas. Así nada flota ni se hunde.
3. Piezas nuevas:
   - `lock`: mechón plano curvado.
   - `curl`: rizo. En LOD0 es un icosaedro de 20 triángulos; se colocan con jitter determinista.
   - `SKIRT`, `SHEET`, `LOC` y `TOP`.
4. **Brillo automático por `G.vc`**: una franja más clara en θ 0,15-0,21π, delante y arriba, con k entre 0,30 (pelo negro) y 0,12 (pelo claro). Cuesta 0 triángulos y arregla H11.
5. **Tabla `HAIR_STYLES`** en lugar del switch:
   `{line, off, vol, flat, lift, parts(G,X,c), under(G,X,hatClass), crown:[x,y,z,rx,rz], band}`.
   - Con `band` se colocan cinta, visera y pañuelo sin casos especiales.
6. **Lo que cuelga va en el muelle `r.hair`**, mezclando pesos de hueso (`G.bone2`/`G.w2`, con una rampa de 0 en la goma a 0,7 en la punta).
   - Coleta, coletas, trenzas, trenza, rastas y mullet.
   - La melena larga se mezcla con `chest`, como la camiseta en doll.js:982.
   - **No se toca players.js `hairSpring`.**

**Clases de gorro** (los gorros adaptan el pelo en vez de prohibirlo):

| Clase | Gorros | Qué se dibuja |
|---|---|---|
| CAP | gorra, gorraMTC | casco con t0≈0,55 (solo la nuca, a 0,99) + `parts` cuya raíz quede bajo el borde + `under()` del peinado. La coleta sale por la abertura de atrás |
| CAPB | gorraAtras | igual, con la abertura delante |
| BUCKET | pescador | igual, sin abertura. **La coleta ya no desaparece**: el nudo baja bajo el ala (arregla J) |
| BAND | cinta, cintaRizo, bandana, visera | el peinado entero. El aro va a R+band+0,004 sobre `headShape` (la geometría del aro es de WP3) |
| CROWN | corona | se ancla en `crown` |

- Se quitan las 6 reglas de CLASH de peinado (look.js:214-219).
- Solo queda «frente con gorro» (y se añade frente+gorraAtras).
- Lo que se quita de CLASH_FALLBACK (doll.js) tiene que quedar igual que en look.js.

**Los 10 peinados de ahora, rehechos con los mismos ids:**
- **tupe:** casco 'corto' con lift y 2 tufts anclados.
- **coleta:** **sin aro** y con la cola fuera del cráneo, como en la rama HIDE_HAIR, que es la buena. Cola de 0,45 en el muelle.
- **afro:** casco 'afro' sin cuña, con 13-19 rizos con jitter. Debe pesar menos que hoy.
- **flequillo:** pasa a llamarse «Tazón». Usa el perfil 'tazon' y **sin auriculares**.
- **rapado:** off 0,003 con una sombra por vc.
- **mono:** moño más grande y más atrás, anclado con shellPt.
- **trenzas:** escaladas por FK y con las gomas en el extremo de verdad.
- **dosmonos:** un poco más grandes.
- **coletas:** casco nuevo y muelle.
- **cresta:** laterales degradados por vc y 3-5 pinchos más anchos.

**Peinados nuevos** (los 22 del estudio, §3). Ids: alCero, degradado, cepillo, undercut, crop, pinchos, rizosCortos, afroCorto, frohawk, melenita, despeinado, cortina, mullet, ondas, melena, coletaBaja, trenza, monoBajo, semirrecogido, twists, rastas, raices.
- 18 son de inicio, para que todo el mundo tenga opciones cortas, largas, recogidas y de textura.
- Los desbloqueos usan los tipos que ya existen (shop, lv, rec, gym, boss, gymN, fame…).
- Total: 32 peinados (antes 10).

**Color:**
- Se mantienen los 15 naturales (los guardados los aceptan).
- En el selector se ordenan por luminancia.
- 6 naturales nuevos que se distinguen: negro azulado, castaño rojizo, miel, rubio ceniza, pelirrojo, blanco.
- 5 tintes nuevos y **tEquipo** (color primario del equipo, por vértice, entra en geoSig).
- **hairFx**, todo por vc y sin triángulos: raiz, puntas, mechas, flequillo, mitad, con `hair2`.
- Las cejas mantienen el color natural cuando el pelo lleva un tinte de fantasía. Si no hay un natural guardado, usan mixHex(hair, 0x3a2416, 0,6).

**NPC (players.js 323/4631):**
- Una lista nueva y ponderada con los peinados de inicio.
- Para no cambiar el aspecto de todos los NPC de la Carrera, se elige con otro trozo del hash: `(h>>>20)%4===0 ? NUEVOS[...] : STYLES_VIEJOS[(h>>>8)%7]`. Solo cambia ≈25 % de los NPC.
- Revisar LOOKS6.

**Criterios de aceptación** (con WP0):
- `node tools/lookshots.js back` y `hair`:
  - en ningún peinado se ve piel en la nuca por encima de la línea del cuello en las vistas de espalda y de lado. Excepciones: alCero, raices (por diseño) y los recogidos, que muestran la nuca con el pelo tirante;
  - no hay dientes en la línea del pelo en el primer plano de frente a 1280x720 (`node tools/lookzoom.js`);
  - las cejas se ven enteras.
- Coleta: la cola sobresale de perfil ≥ 0,15 m por detrás del cráneo (medir en la hoja de perfil) y no hay aro.
- `node tools/lookshots.js combos --item=c_head_beach,c_head_beach2,c_head_beach3,c_head_hall`: con gorra hay pelo en la nuca y las coletas y trenzas salen del pelo.
- **Silueta en el partido:** en `node tools/lookshots.js game --venue=hall` (móvil), lookvis da una diferencia ≥ 9 px respecto al tupé para al menos 24 de los 32 peinados, vistos de espaldas.
- `node tools/looktest.js --gl` en verde, con el peor caso por sede ≤ TRI_CAP. TRI_TODAY se regenera.
- Sin errores de consola: `bash tools/console.sh`.

**Presupuesto.** Cada peinado ≤ el afro nuevo en todos los LOD. Con gorra, el coste total ≤ el del peinado sin gorra.

**Riesgos:**
- Dos ganchos que se mezclan: la restricción de la cara y el desfase sobre `headShape` en LOD0 (14×7). Validar en LOD0 con `&quality=low`.
- Los pesos `w2` en un hueso que solo existe en `r.hair`: comprobar `buildRig` en el retrato y en el partido.
- La `fromSeed` del jefe (look.js:796) tiene que dar el mismo jefe que antes. Si no, se acepta el cambio y se anota.

---

### WP3. Objetos de cabeza y cara (después de WP2, misma zona)

**Archivos:** doll.js `headGeo` (la parte de gorros 1241-1300), `crownGeo`, `mtcPanel` 1137-1153, `eyesGeo` 1300-1331, `faceGeo`, `paintEyes`, `paintGlasses` 735-774, `paintPaint` 686-708, `paintMarks` 710-731, `paintBeard` 836-907, las constantes de las láminas (326, 367-376 y 672-680), y look.js para las entradas.

**Cambios:**

1. **Capas de la cara** (C9 y C10):
   - Los halos de ojos y boca se recortan a la franja que no se solapa (los ojos por encima de −0,30, la boca por debajo de −0,36).
   - F_OFF depende del LOD: 0,0035 en LOD0, 0,0025 en LOD1 y 0,002 en LOD2. Otra opción: la lámina en LOD0 con mínimo 8×5.
   - Sin polygonOffset, para no crear programas nuevos.
2. **Cintas que abrazan la cabeza** (C1):
   - Un aro que muestrea `headShape` (o `shellPt` con `band` del peinado), elíptico, inclinado 10-15°, a dy≈0,5 para que se vean las cejas, y 0,004 por fuera del pelo.
   - `cinta`: una cinta plana de 2-3 cm con una franja de contraste **por color de vértice** (se acaba el toro dentro del toro).
   - `cintaRizo`: un tubo gordo con rayas por vc.
   - **bandana:** un pañuelo de verdad. Casquete de pañuelo en cA con lunares por vc, más el nudo y las colas que ya hay. Se lee desde atrás y desde arriba. 300-450 triángulos.
   - Que estas piezas finas y saturadas no brillen: clampar la luminancia del acento a < 0,9.
3. **Viseras** (C2 y C3):
   - Gruesas (0,03), **cerradas por abajo**, con una curva ligera.
   - Por arriba en cA y por debajo en cA×0,8, nunca tc.dark.
   - owk 0,6 y levantadas 0,01 respecto a las cejas.
   - Mismo arreglo en la visera de playa. Su banda se coloca como en el punto 2.
   - 100-150 triángulos por visera.
4. **Gafas pintadas** (C4 y P):
   - `oscuras`: alfa 0,92 con un brillo diagonal; las pupilas no se ven.
   - `espejo`: alfa 0,95 iridiscente con montura oscura o dorada.
   - Trazo de la montura 0,016-0,02.
   - Las gafas se pintan después de las cejas.
   - Las patillas siguen la cabeza: 2 cuerdas que acaban en la oreja, sin el empuje que se acumula. Los mismos 24 triángulos.
   - **Se construyen también en LOD0**, porque son lo único que se ve de espaldas.
5. **frente** (C5): se coloca sobre el pelo con `shellPt` (con tupé, encima del tupé), inclinada 25° hacia atrás, con las patillas rodeando la cabeza. CLASH añade gorraAtras.
6. **Pintura y marcas** (C6):
   - Se pasan a las celdas de la lámina de boca, por debajo de MOUTH_TOP (y 0,07-0,12), y FM_DX sube de 0,56 a ≈0,7.
   - Se redibujan grandes: zinc como banda nariz-mejillas; rayas de 1,5×4 cm con borde claro en piel oscura; estrella r 0,04 en el centro de la mejilla; pecas de 10-14 puntos r 0,007; tirita como una X blanca con tinta.
7. **Barbas** (C7):
   - Bigote en la fase 0, encima del labio, con las puntas hacia arriba.
   - Perilla redondeada y separada de la boca.
   - tresDias como una máscara lisa de mandíbula a alfa 0,35.
   - Borde más claro en piel oscura.
   - Barba completa nueva («barba»), ya que FM_DX crece.
8. **Corona** (C8): anclada con el `crown` de cada peinado, ×1,4, con puntas ×1,6 y gemas a los lados. 250-350 triángulos.
9. **gorraMTC** (C11): sube el θ del panel para que la visera no corte las letras, y lleva un botón y una banda de atrás en el acento, para distinguirla de lejos.
10. **Que se vea en el partido** (C12):
    - `deporte` lleva una goma en cA por la nuca (≈64 triángulos).
    - `oscuras` y `espejo` llevan un cordón de gafas por detrás.
    - Pintura y barbas no cambian (se aceptan como solo de primer plano y se dice en la UI, ver WP6).

**Criterios de aceptación:**
- `node tools/lookshots.js head`, revisando estas hojas:
  - head-cinta/cintaRizo/bandana: en la vista desde arriba no hay hueco entre el aro y la cabeza o el pelo; las cejas se ven de frente; las tres se distinguen de frente y de espaldas.
  - head-gorra/gorraAtras/gorraMTC/visera: la visera no se lee como una raya negra; desde abajo (añadir una casilla «desde abajo 30°» a lookshots) la visera tapa.
  - eyes-oscuras: no se ven las pupilas. eyes-espejo: no se ven los iris. eyes-frente: ni enterradas ni patillas en el aire.
  - paint-* y marks-*: lookvis da en el primer plano ≥ 1,5 % de la caja de la cabeza en las dos pieles.
  - beard-bigote: la boca sigue sonriendo.
- En LOD0 (`&quality=low`, primer plano), sin z-fighting bajo los ojos.
- `looktest --gl` en verde.

**Presupuesto.** Cada objeto de cabeza ≤ 450 triángulos en LOD2 y ≤ 250 en LOD0. El peor caso (peinado × gorro × gafas) ≤ TRI_CAP.

---

### WP4. Piernas y pies (pista B, en paralelo con WP2 y WP3)

**Archivos:** doll.js `paintLimbs`, solo la parte de piernas (≈614-641); `kneeGeo` y `kneeHex` 1058-1080; tobillo y pie descalzo 1081-1100; `shoeGeo` 1101-1113. look.js, entradas de legs, knees, socks, ankle y shoes, y el color nuevo `cPad`.

**Cambios:**
1. **Tobillera de pista** (P1):
   - El cilindro sale del zapatón: y +0,03..+0,075, r un poco mayor que la espinilla, con el ribete en el labio.
   - `blanca` = una tobillera acolchada que se ve por encima del zapatón (alta hasta y +0,09, con un toro), de color blanco o del kit, que contraste con el empeine.
   - Sin tobillera = solo el cuello bajo.
2. **Anillas del tobillo en playa** (P2): tela, tobiPulpo y pulseraTob suben a y +0,035..+0,045, alrededor de la espinilla. Tubo de 0,012 en tela y de 0,006 en pulsera. Opcional: empeine descalzo con ry de 0,07 a 0,06.
3. **Calcetines** (P3):
   - Todas las bandas suben ≈0,2 de la espinilla.
   - `tobilleros` de 0,72 a 1, con un puño vuelto más oscuro.
   - `media` desde 0,45.
   - `desparejados`: un color entero distinto por pierna y alturas distintas.
   - `altosRayas` con rayas sobre un calcetín de color.
4. **Rodilleras** (P4 y P6):
   - `altas`: bola alargada (Y×1,5) con las bandas pintadas fuera de la bola y aros en los extremos.
   - `bajadas`: un aro grueso en la espinilla (r 0,068, h 0,05) con la rodilla de piel.
   - Contraste: si la rodillera queda a < 0,15 de luminancia de la malla o de la piel, se usa blanco o el acento.
   - Color nuevo **`cPad`** (como cShoe).
5. **malla** (P5): en cB o en un tono con una diferencia de luminancia ≥ 0,25 respecto al pantalón, con el bajo en tc.accent. Pasa a `vc:'B'`. En playa, cB en lugar de tc.base.
6. **Zapatillas** (P7, después del vc de la puntera que hizo WP1):
   - Una forma propia por modelo: `negras` bajas, `neon` con suela gorda, `doradas` en 0xd9a520 con franja de brillo por vc y cordones GOLD_HI.
   - Franja de suela y franja lateral por vc.
   - Cordones: 3 cajas planas, solo en LOD2.
   - La puntera neon en un color fijo de contraste (0xff3aa8), nunca tc.accent.
7. **mallaLarga + calcetín corto**: sin franja de piel. El calcetín empieza donde acaba la malla, o la malla baja.

**Criterios de aceptación:**
- `node tools/lookvis.js --item=blanca,pulseraTob,tela,tobiPulpo,tobilleros,media,desparejados,altas,bajadas,malla` da VISIBLE en el primer plano en las dos pieles y los dos kits.
- En el partido en el móvil (de espaldas): VISIBLE ≥ 9 px para blanca, tobilleros, desparejados, altas y bajadas.
- `node tools/lookshots.js legs` y `combos --item=c_legs_hall,c_legs_hall2,c_legs_hall3,c_legs_beach,c_legs_beach2`: con mallaLarga se ve la rodillera.
- Las 4 zapatillas tienen siluetas distintas en la vista de lado.
- `looktest --gl` en verde.

**Presupuesto.** Lo que ahorra la puntera (WP1) paga la tobillera acolchada y las rodilleras: ≤ +100 por pierna en LOD2 y ≤ +40 en LOD0. El peor caso de playa no puede pasar de 4400 en LOD0.

---

### WP5. Torso y brazos (después de WP4, porque comparten `paintLimbs`)

**Archivos:** doll.js `paintBody` 403-440 (licra y térmica en el tronco), `paintLimbs` (brazos 488-612), `sleeveFill` 506-566, `shoulderGeo`/`elbowHex`/`foreGeo`/`wristGeo`/`handGeo` 1005-1057 y `neckGeo` 1114-1136. look.js, sus entradas.

**Cambios:**

1. **licra** (T1):
   - Manga larga en cB por todo el brazo y el antebrazo, con el puño más oscuro (se reutiliza la rama de la térmica con beach=true), más el cuello alto en cB en el tronco y la costura lateral.
   - Antes de nada, con una sola pasada, `node tools/lookshots.js game --item=licra --venue=beach`, comprobar que `under` llega a la malla del partido (sospecha de un segundo fallo).
   - Lo mismo para la licra de manga corta como objeto nuevo (WP7).
2. **Ayuda de contraste `pick(c, bg)`**, para T3, T4 y T8: si la distancia de color es menor que un umbral, se cambia a tc.dark o a blanco.
   - Coderas sobre manguito, brazalete sobre manguito, rayo del manguitoRayos, cinta de la medalla.
   - Esparadrapo sobre piel clara (lum > 0,8 → 0xd9d2c0 más tinta).
3. **kinesio** (T5): dos tiras (delante y de lado, en xc±w/4) de H*0,18 de ancho, más una tira en el antebrazo.
4. **térmica** (T6): cuello alto en cB. Pintado en el tronco y además un aro `cyl` de 32-48 triángulos para tener un cuello con tinta. Con manguitos sigue viéndose.
5. **manguitoOro** (T7): oro de cómic (base ocre, banda GOLD hacia la luz, raya GOLD_HI del 12 %, borde marrón y un destello).
6. **mitones** (T9): sin dedos. Por vc según la y local: las puntas de piel y un puño acanalado.
7. **medalla** (T9): disco de r 0,045 con borde oscuro y cinta bicolor cA/cB.
8. **muneq / munhCanon** (T10): cilindro abierto de h 0,045 más 2 rebordes (≈120 triángulos por muñeca); munhCanon con aro de cA.
9. **coderas**: una concha acolchada sobre el codo (≈60 por brazo) en tc.pad o cPad con reborde cA.
10. **Brazalete** (R): pintado alrededor de todo el brazo, no solo por fuera. Se aleja del ribete (0,56-0,7). El slot sigue siendo solo del brazo izquierdo, que es lo correcto en vóley.
11. **«Refuerzo» de LOD1** para piezas de muñeca y cuello (×1,25 en LOD ≤ 1), siempre que lookvis lo pida.

**Criterios de aceptación:**
- `node tools/lookshots.js torso` y `combos --item=c_torso_hall,c_torso_hall2,c_torso_beach`: la licra se lee como una licra.
- lookvis da VISIBLE en el primer plano para todos los objetos de torso y brazos en los 2 kits × 2 pieles.
- En el partido en el móvil: VISIBLE para licra, térmica, manguitos, coderas, muneq y kinesio.
- `looktest --gl` en verde.

**Presupuesto.** Cada objeto ≤ 240 en LOD2 y ≤ 120 en LOD1.

---

### WP6. Interfaz del Vestuario (pista C, en paralelo)

**Archivos:** js/ui.js 4048-4686 (LK_TABS/ROWS, `lkRowHTML`, `lkStep`, `lkPlace`, `lkPvOpts`, LK_FRAME, LK_CAPS, LK_UNDER_CAP); doll.js zona Z-preview (PV_FRAMES 1729-1734, preview.* 1760-1900); el CSS del Vestuario en index.html; notes/splat.md, solo si hay un componente nuevo.

**Cambios:**

1. **Encuadre y giro por RANURA** (U2):
   - `VB.Doll.preview.frameSlot(slot, opts)` usa la caja del hueso o de la pieza: cabeza, nuca, brazo de ese lado, rodilla, tobillo, pies.
   - La transición dura ≈300 ms.
   - Tabla por ranura:
     - style → cabeza de 3/4 y, si el peinado lleva volumen detrás, giro suave a 160° y vuelta;
     - head → perfil de 3/4;
     - eyes, paint, marks y beard → cara de frente a d corta;
     - armL/armR → ese brazo girado hacia la cámara;
     - band → brazo izquierdo;
     - ankle/shoes → pies;
     - knees → rodillas.
   - Cambia al tocar o enfocar la fila.
2. **Vertical** (U3):
   - La mitad de arriba es solo para el muñeco, con encuadre por ranura (`place()` con top y bottom también en vertical).
   - La cabecera se reduce al título.
   - ⟲ ⟳ van a los lados del muñeco, nunca debajo de «Volver».
   - La columna de botones no pisa al muñeco.
3. **Selector en rejilla al tocar la fila** (U5):
   - Una hoja de abajo o un carril horizontal de fichas con **miniaturas del propio muñeco**: render a un objetivo pequeño, en caché por (objeto, sede, piel, kit), con el encuadre de la ranura.
   - Se generan de forma perezosa, unas pocas por fotograma.
   - Peinados: chips de familia (Corto · Medio · Largo · Recogido · Textura).
   - Colores, piel y pelo: muestras circulares de 44 px en rejilla.
   - Las flechas ‹ › se mantienen para el mando y el teclado.
   - Objetivo: ≤ 30 toques para un look completo.
4. **Colores con sentido** (U4 y S):
   - Cada fila dice qué pinta, con `uses` de WP1: «Complementos: gorra, manguitos».
   - Se atenúa con «No llevas nada de este color» si no hay nada que lo use.
   - La pieza afectada parpadea en el muñeco durante 400 ms al cambiar.
   - En playa sale el color de calcetín si se llevan escarpines.
   - Fila nueva de cPad.
5. **Avisos de tapado**, como el de la gorra:
   - «La tobillera queda bajo los calcetines altos» (si sigue pasando).
   - «La pintura de la cara no se ve de espaldas en el partido».
   - LK_UNDER_CAP se calcula desde HAIR_STYLES (adiós a la lista a mano).
6. **Pestañas** (U6):
   - Los 7 iconos caben a 568x320: 36 px con 44 px de zona táctil, o se marca que hay más.
   - Etiqueta de la pestaña activa.
   - Iconos claros: gorra para Cabeza, brazo o manguito para Brazos.
7. **Bloqueado** (U7): una línea bajo el nombre en todos los tamaños: «🔒 3.000 € en la tienda o 3 medallas · se puede probar».
8. **Hoja «⋯»** (U8): un solo botón de cerrar y que quepa «Copiar a playa». Un dado de «Al azar» junto a «Probar». Al azar por pestaña.
9. **Textos** (U9): la estrella solo desde rareza 1; «Manguito (brazo izq.)»; «Sin muñequera», «Sin collar»; letra mínima de 13 px en el móvil.
10. **Giro** (doble toque, sin pellizco, que es la regla de cámara):
    - Botón «dar la vuelta» de 180° animado.
    - Doble toque para acercar o alejar entre el encuadre de la ranura y el de cuerpo.
    - Un aviso de una sola vez: «Arrastra para girar».
11. **Fondo de playa** en el Vestuario de playa, como mínimo suelo de arena y luz de playa (U10).
12. **«Probar» encuadrado** a tamaño 'cuerpo' (U11).
13. LK_CAPS de reserva con gorraMTC (V).

**Criterios de aceptación:**
- `node tools/vestuxaudit.js` y `node tools/vestuxprobe.js` a 568x320, 640x360, 360x640 y 1280x720:
  - en metrics.json, ni la cabeza, ni los pies, ni las manos quedan tapados por la UI (elementFromPoint) en ninguna pestaña;
  - ⟲ ⟳ no tapados;
  - las 7 pestañas alcanzables y visibles;
  - ningún texto < 13 px en el móvil;
  - sin recortes.
- Al elegir `ankle` el encuadre muestra el tobillo. Al elegir coleta, la vista gira a la espalda.
- Las miniaturas se generan sin tirones: < 8 ms por fotograma, medido con performance.now dentro del Vestuario.
- `bash tools/console.sh` sin errores. `node tools/csscheck.js` en verde.
- Estilo SPLAT según notes/splat.md: «el partido se ve» y sin pegatinas que se pisen.

**Riesgos:**
- Memoria de las miniaturas en el móvil: caché LRU de ≤ 48 y objetivos de 96 px.
- Gestos: no usar el pellizco.

---

### WP7. Objetos nuevos para llenar huecos (después de WP3 y WP5)

**Objetivo.** Variedad que **se lea desde atrás y de lejos**. Cada objeto debe cambiar ≥ 25 % del área del zapatón o ≥ 30 % de la espinilla, o dar una silueta o una masa de color desde atrás o desde arriba.

**Selección priorizada** (ids nuevos; los costes son estimados):
- **Cabeza:**
  - `diadema` (60/80/120)
  - `pinzas`
  - `gorroPompon` (solo calentamiento, ≈450)
  - `pescadorEstampado` (vc, +0)
  - `viseraGafas` (playa, +80)
  - `pendientes` (40-60)
  - `gafasRedondas`, `aviador` (pintadas)
  - `gafasVentisca` (playa: banda y correa, ≈200; se ve de espaldas)
- **Cara:** `pinturaEquipo` (media cara en los colores del equipo), `rayoOjo`, `tiritaNariz`, `barba` (completa, si no la hizo WP3), `bigote70`.
- **Torso y brazos:**
  - `licraCorta` (playa)
  - `manguitoMedio`, `manguitoAntebrazo`, `manguitoBicolor`, `manguitoDegradado`, `manguitoEstrellas`, `manguitoNumero`
  - `dedosColor`, `cintaMuneca`, `muneqDoble`
  - `bandanaCuello` (≈64), `silbato` (≈100), `cadenaPlata` (≈80)
- **Piernas y pies:**
  - `botinAlto` (+60), `suelaGorda`, `bicolor`, `retro`
  - `compresion`, `lunares`, `caido` (calcetines)
  - `rodillerasColor`, `rodilleraUna`
  - `mallaUnLado`, `malla34`
  - playa: `escarpinesNeo`, `vendajeTob`, `cuentasTob` (solo LOD2)
- **NO entran:** guantes de portero, flores, pañuelos de pelo ni gomas en la muñeca. No se ven en el móvil o no son de vóley.

**Desbloqueos.** Los tipos que ya existen, repartidos entre inicio, tienda, nivel, gimnasio y retos, para que la Carrera tenga premios nuevos. Se revisa en look.js `grant` y en la tienda de la Carrera.

**Criterios de aceptación:**
- lookvis da VISIBLE en el primer plano para cada uno.
- Los de pelo, cabeza, piernas y brazos por fuera: VISIBLE en el partido en el móvil.
- `looktest` y `looktest --gl` en verde.
- El peor caso ≤ TRI_CAP.

---

### WP8. Integración, documentación y publicación

**Pasos:**
- Combinar las pistas y volver a pasar todas las comprobaciones (§4).
- notes/players.md § Vestuario (≈1043): casco de pelo, líneas de pelo, clases de gorro, `pick`, `uses`, `_keep`, campos nuevos y Δ de triángulos medidos. Se corrige lo de geo:false de licra y mallaLarga.
- version.js: VERSION y CHANGELOG arriba (build-pages lo exige).
- Memoria del proyecto: actualizar make-the-cut-*.md si cambia alguna decisión, como las clases de gorro.

**Publicar lo decide Ferran**: él abre los sprints.

**Novedades.** Una sola versión menor (p. ej. 1.16.0). La entrada lista **solo lo nuevo**:
- «32 peinados»;
- «tintes y mechas»;
- «objetos nuevos»;
- «miniaturas y cámara que enfoca lo que eliges».

Los arreglos (tobilleras que no se veían, nuca, coleta, licra…) **nunca** se anuncian como novedad, por la regla de la memoria «sin arreglos menores; un arreglo nunca como novedad».

---

## 3. Restricciones globales

### 3.1 Técnica
- **Una malla y un atlas por muñeco, 3 dibujos (piel, tinta y sombra), cero programas nuevos.** Todo el color nuevo va por atlas o por `G.vc` y `G.owk`.
- No se añade polygonOffset salvo que WP3 demuestre que no hay otra forma y no cree un programa nuevo.
- Three.js r149 y scripts clásicos sobre window.VB. Comentarios y textos en castellano.
- `G.vc` pasa la pieza a no indexada: aplicarlo solo donde haga falta.
- **Ningún cambio en la simulación** (sim.js, ai*.js): todo es estético. `node tools/simtest.js` tiene que dar lo mismo.

### 3.2 Presupuesto (12 muñecos en el 6v6 del móvil)
- TRI_CAP 4400/6000/12800 sin cambios en LOD0.
- **Peor caso** (peinado × gorro × gafas × resto) ≤ TRI_CAP por sede, comprobado por `lookSelfTest`.
- Ahorros previstos: la puntera por vc (WP1) y el afro nuevo (WP2, −≈1000 en LOD2).
- Atlas: 512² en el partido (sin cambios) y 1024² en la vista previa del Vestuario (WP1).
- Cambios de malla en la vista previa ≤ 1 por cada 120 ms (ya existe). Las miniaturas, perezosas.

### 3.3 Guardados
- Ids que nunca se borran ni se renombran. Los nombres visibles sí pueden cambiar.
- `sane()` rellena los campos nuevos y conserva los desconocidos en `_keep` (WP1).
- La ida y vuelta de tools/fixtures/looks-1.15.1.json pasa por looktest.
- Carrera: c.life.look pasa por el mismo `sane`.

### 3.4 Sincronización y online
- **Firestore.** La clave 'look' es texto JSON. Las reglas solo miran claves, tamaño (≤ 400 000) y tipos. **No hace falta cambiar firebase/firestore.rules** para los ids ni para los campos nuevos.
- **Riesgo entre versiones.** Un cliente 1.15.1 (otro dispositivo sin actualizar) que lea un fit nuevo pasará el peinado desconocido a su valor por defecto en `saneRaw` (look.js:285). Si luego sube, podría pisar el fit en la nube.
  - Antes de publicar, el implementador de WP1 revisa `mergeLook` (account.js) y el aviso de actualización (update.js).
  - Si el riesgo es real, se documenta y se publica con el aviso de actualización. No se puede arreglar en los clientes viejos.
- **Online 1v1** (netlobby.js:131-141). El look viaja saneado. Un rival con una versión vieja verá los objetos nuevos por defecto: aceptable, es solo estético. Comprobar que la sala ya exige la misma versión (`v`).
- `node tools/synctest.js` en verde.

### 3.5 Pruebas que deben seguir en verde
- `node tools/looktest.js`
- `node tools/looktest.js --gl` (lookSelfTest)
- `bash tools/console.sh` (sin errores de consola)
- `node tools/simtest.js` (sin cambios)
- `node tools/synctest.js`
- `node tools/kittest.js`
- `node tools/csscheck.js`
- `node tools/build-pages.js` (versión y CHANGELOG)

### 3.6 Rendimiento del PC de trabajo
- Un Chrome por agente y cerrado al acabar.
- Mirar el espacio libre en C: antes de las capturas. lookshots usa JPEG, ≈84 MB por pasada completa.

---

## 4. Lista final de verificación

1. [ ] `node tools/looktest.js` y `--gl` en verde. El informe de margen muestra el peor caso ≤ TRI_CAP en pista y playa, en los 3 LOD. TRI_TODAY regenerado.
2. [ ] La ida y vuelta de los fits de 1.15.1 no pierde nada. Un id desconocido sobrevive en `_keep`.
3. [ ] `node tools/lookvis.js` (todo el catálogo):
   - 0 objetos INVISIBLES en el primer plano;
   - los objetos de pelo, cabeza, piernas y brazos por fuera, VISIBLES de espaldas en el partido en el móvil;
   - los de cara marcados como «solo de primer plano» y avisados en la UI.
4. [ ] `node tools/lookshots.js back,hair`:
   - sin nuca calva ni borde de casco;
   - línea del pelo sin dientes (lookzoom a 1280);
   - coleta con cola y sin aro;
   - flequillo sin auriculares;
   - afro sin cuña;
   - trenzas con las gomas en su sitio;
   - ≥ 24 de 32 peinados distinguibles por la silueta de espaldas en el móvil y en LOD0.
5. [ ] `node tools/lookshots.js head,combos`: cintas pegadas a la cabeza, viseras gruesas y cerradas, gafas oscuras y de espejo opacas, frente encima del pelo, pintura y marcas grandes, corona apoyada, gorros con pelo en la nuca.
6. [ ] `node tools/lookshots.js legs,torso`:
   - tobillera, pulsera, tela, tobilleros, altas, bajadas y malla visibles;
   - licra como una licra;
   - sin choques de mismo color (coderas, brazalete, rayo, dedos).
7. [ ] LOD0 (`&quality=low`) en el primer plano: sin z-fighting en la cara ni en el pelo.
8. [ ] `node tools/vestuxaudit.js` y `vestuxprobe.js` a 568x320, 640x360, 360x640 y 1280x720:
   - muñeco sin tapar;
   - ⟲ ⟳ accesibles;
   - 7 pestañas;
   - letra ≥ 13 px;
   - encuadre por ranura (tobillo, nuca, brazo);
   - miniaturas y rejilla de colores;
   - bloqueado explicado;
   - hoja «⋯» entera.
9. [ ] La vista previa del Vestuario en el móvil va en LOD2 y con atlas de 1024².
10. [ ] 6v6 a 640x360 en el móvil: fps sin peor que 1.15.1 (misma escena y herramienta, antes y después).
11. [ ] `bash tools/console.sh`, `node tools/simtest.js`, `node tools/synctest.js`, `node tools/kittest.js`, `node tools/csscheck.js` y `node tools/build-pages.js` en verde.
12. [ ] Los NPC llevan peinados nuevos (≈25 %) y los jefes de `fromSeed` siguen reconocibles.
13. [ ] notes/players.md § Vestuario actualizado.
14. [x] version.js: VERSION y CHANGELOG solo con novedades, sin arreglos (1.18.0 «Vestuario renovado», 20-nov-2026).
15. [ ] Ferran lo revisa en su móvil antes de publicar.
