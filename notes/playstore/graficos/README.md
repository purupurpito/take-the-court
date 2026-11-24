# Gráficos de la ficha de Google Play

Todo sale del juego de verdad (1.22.0) con Chrome headless. Para volver a sacarlos:

```
node tools/storeshots.js --out notes/playstore/graficos
node tools/storeshots.js --only movil-0[24]     # solo algunos
node tools/storeshots.js --list                 # qué saca y de dónde
```

Sin datos reales: cada carga borra el almacenamiento local (`&ma_clean=1`, perfil temporal), el online usa la sala de prueba
en memoria (`&olmock=1`, sin Firestore) y la Carrera es una de muestra creada en la página. Sin capas de depuración: lo que se
ve es la interfaz normal del juego en modo móvil (`html.ph`, táctil, UA de Android).

## Requisitos de Play (noviembre de 2026)

| Gráfico | Lo que pide Play |
|---|---|
| Icono | PNG de 32 bits (con alfa), 512×512, máx. 1 MB. Play le pone la máscara (esquinas redondeadas del 20 %); se sube a sangre, sin sombras ni bordes propios |
| Gráfico destacado | PNG o JPEG sin alfa, 1024×500, máx. 15 MB. Lo importante, en el centro (Play puede recortar los bordes o poner encima el botón del vídeo) |
| Capturas de móvil | De 2 a 8. PNG o JPEG sin alfa, máx. 8 MB cada una. Lado corto ≥ 320 px, lado largo ≤ 3840 px, proporción máx. 2:1. Para salir en las listas de juegos hacen falta al menos 4 de 1080 px o más (16:9 apaisadas: 1920×1080) |
| Capturas de tablet 7" y 10" | Opcionales (hasta 8 de cada). Mismos formatos; 16:9 o 9:16, lado corto ≥ 320 px (10": ≥ 1080 px recomendado) |

## Ficheros

| Fichero | Tamaño | Peso | Qué es |
|---|---|---|---|
| `icono-512.png` | 512×512, PNG 32 bits | ~62 KB | El logotipo «Red cruzada» con el balón O (`pages/icon.svg`), a sangre. El dibujo va al 82 % para que la «T» de la esquina no se corte con la máscara redonda; el fondo y la red siguen llegando a los bordes |
| `icono-mascaras.png` | 1100×420 | ~60 KB | **No se sube.** Solo para comprobar el icono con la máscara de Play, en círculo y a 96 px |
| `grafico-destacado.png` | 1024×500, PNG sin alfa | ~540 KB | Partido de playa de fondo (solo el 3D, sin marcador ni botones) con un bloqueo en la red y el logotipo; sin más texto que «Take the Court» del propio logotipo. Logo y jugada dentro de la zona central |
| `movil-01-portada.png` | 1920×1080 | ~1,8 MB | Portada: logotipo, Jugar, Jugadores, Vestuario, Cómo se juega, Controles, Ajustes |
| `movil-02-playa-2v2.png` | 1920×1080 | ~1,8 MB | Vóley playa 2 contra 2: remate rival con el balón en el aire, mandos táctiles a la vista |
| `movil-03-pista-6v6.png` | 1920×1080 | ~2,4 MB | Pista 6 contra 6 en pabellón: el balón sube para el ataque, consejo «Ataca el opuesto: cubre el ataque» |
| `movil-04-carrera.png` | 1920×1080 | ~1,2 MB | Carrera en pista: próximo partido de la Hiperliga 2, informe del rival, rueda de prensa y mensajes |
| `movil-05-online-sala.png` | 1920×1080 | ~1,2 MB | Online: sala de espera con código, «Tú contra Remate88» (apodo de ejemplo de la sala de prueba). Sacada a 720×405 (16:9, móvil algo más alto): a 640×360 la tarjeta desplaza y las reglas quedan medio difuminadas abajo. |
| `movil-06-estadisticas.png` | 1920×1080 | ~0,3 MB | Estadística del partido: sets y cifras clave (side-out, break point…) |
| `movil-07-remate-6v6.png` | 1920×1080 | ~2,6 MB | Pista 6 contra 6: remate contra el bloqueo, vista desde arriba |
| `movil-08-final.png` | 1920×1080 | ~0,8 MB | Hoja final: ¡Victoria! 2-1, sets, MVP y Revancha |
| `tablet7-01-playa-2v2.png` | 1920×1080 | ~1,8 MB | Tablet 7" (960×540 a DPR 2): vóley playa 2 contra 2 |
| `tablet7-02-carrera.png` | 1920×1080 | ~1,3 MB | Tablet 7": Carrera en pista con el informe del rival completo |
| `tablet10-01-pista-6v6.png` | 2560×1440 | ~3,7 MB | Tablet 10" (1280×720 a DPR 2): pista 6 contra 6 |
| `tablet10-02-portada.png` | 2560×1440 | ~2,8 MB | Tablet 10": portada |

Orden recomendado al subir las de móvil: 02, 03, 04, 01, 07, 05, 08, 06 (la primera es la que más se ve: mejor una jugada).

Todas las capturas y el gráfico destacado van en PNG de 24 bits **sin canal alfa**; el icono, en PNG de 32 bits. Todas
cumplen los límites de arriba (ninguna pasa de 4 MB; la mayor, 2560×1440, proporción 16:9 = 1,78:1).

## Para decidir

- La portada lleva la etiqueta «BETA» del logotipo del menú. Si la ficha sale como versión final, quitarla del juego y volver a sacar las capturas.
- Los nombres de clubes, jugadores y el apodo del online son inventados por el juego (o de ejemplo).
