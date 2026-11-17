/* MAKE THE CUT — js/version.js (owner: ui_main)
 * Una sola fuente para el número de versión, las novedades y los créditos. Solo datos: sin DOM y sin red.
 * Se carga el primero después de three.js (antes de account.js). Lo leen ui.js (panel «Acerca de», pestaña Info de Ajustes,
 * #btnVer de la portada, aviso de novedades una vez por versión), main.js (ctx.bootInfo.version) y tools/build-pages.js (con vm:
 * metadatos de Pages y guardas del build) y tools/abouttest.js.
 * REGLA DE VERSIONADO: cada publicación con un cambio que se vea en el juego sube VERSION y añade su entrada ARRIBA de CHANGELOG
 * (la más nueva primero). build-pages falla si CHANGELOG[0].v !== VERSION o si VERSION no es semver (x.y.z).
 * Textos (notes/ui_main.md, «Textos: guía de estilo»): frases cortas, sin el punto medio como pegamento, ordinales «1r» «2º»,
 * género neutro, sin nombres reales ni patrocinadores de verdad. Este fichero no lleva arrobas ni la palabra del programa de
 * navegación web (tools/abouttest.js lo comprueba en todo el fichero, comentarios incluidos).
 * 1.0.0 (12-nov-2026, decisión de Ferran): cierre del sprint 5. Sin créditos a herramientas de IA (Ferran, 12-nov-2026).
 * 1.1.0 (13-nov-2026): Vestuario (personalización del aspecto, js/look.js). Solo estética.
 * 1.2.0 (15-nov-2026): sedes generadas por club (js/venue-gen*.js) y pabellón al azar por partido.
 * 1.3.0 (15-nov-2026): sprint 2-4 «Tu carrera», «Partidos que se recuerdan» y «Volver mañana» (retratos y escudos, portada con la
 *   Carrera, previa y resumen de jornada, repeticiones, jefes y química, retos y perfil). Los entrenos con el club ya venían de main.
 * 1.5.0 (16-nov-2026): Online beta (js/net*.js, notes/net.md): lobby con salas en Firestore, WebRTC, gorra Online Beta Tester.
 * 1.5.3 (17-nov-2026): árbitros con las señas oficiales y el 2º árbitro que se mueve con el juego (js/arena.js).
 * 1.7.0 (17-nov-2026): Acta del partido (js/acta.js): los partidos 6v6 salen como acta de emPat (formato empat/acta). NO es público
 *   (Ferran, 17-nov-2026): el botón solo sale con su cuenta (ui.js ACTA_ALLOW) y las novedades no lo anuncian.
 * 1.8.0 (17-nov-2026): fusión de la rama pruebas-entrenos: pruebas con partidillo de petos (ampliadas: IA un nivel por encima,
 *   rivales mejores, invitaciones a mitad y fin de temporada), entrenos Jugar/Rápido/Descansar y nota en directo.
 * 1.8.1 (17-nov-2026): cámara del 6v6 que sigue al balón y zoom de cámara (js/camera.js, js/input.js).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  VB.VERSION = '1.8.1';
  VB.VERSION_DATE = '2026-11-17';

  /** Novedades: {v, d:'AAAA-MM-DD', t (título corto), items[] (frases de 90 caracteres como mucho)}. La más nueva primero. */
  VB.CHANGELOG = [
    {
      v: '1.8.1', d: '2026-11-17', t: 'Cámara',
      items: [
        '6 contra 6: la cámara sigue mejor al balón y se aleja para no perderlo.',
        'Zoom de cámara: rueda del ratón, teclas + y -, stick derecho o la lupa en el móvil.',
        'Ajustes: elige el zoom de cámara, de 1 (cerca) a 5 (lejos).'
      ]
    },
    {
      v: '1.8.0', d: '2026-11-17', t: 'Pruebas, entrenos y nota en directo',
      items: [
        'Las pruebas de club son un partidillo con petos: un set a 15 y tres objetivos.',
        'Con nota B o mejor te fichan; con C decide la suerte y ganar el partidillo ayuda.',
        'Rivales mejores que tú y la IA un nivel por encima. Simularla da menos opciones.',
        'Clubes mejores te invitan a prueba a mitad y a final de temporada, en playa y en pista.',
        'Ojo: si reinicias o abandonas la prueba, la pierdes.',
        'Nota en directo en los partidos de Carrera: tus buenas acciones suman y las malas restan.',
        'Pista: con muy mala nota vas al banquillo; si destacas saliendo de él, juegas de inicio.',
        'Plan del entrenador: tres sesiones por jornada, jugadas, rápidas o de descanso.',
        'El Rápido te da tu récord jugando, sin llegar al oro. Jugar siempre rinde más.',
        'Nota de cada ejercicio con letra, récord y la barra del atributo subiendo.',
        'Entreno automático para quien solo quiere jugar los partidos.'
      ]
    },
    {
      v: '1.7.0', d: '2026-11-17', t: 'Más datos en la estadística',
      items: [
        'La estadística del 6 contra 6 guarda también alineaciones, cambios y tiempos muertos.'
      ]
    },
    {
      v: '1.6.0', d: '2026-11-17', t: 'Estadística del partido',
      items: [
        'Al acabar un partido, pulsa «Estadística del partido»: los números de los dos equipos.',
        'Side-out, break point, quién iba por delante, mapas de saque y ataque y dónde se falla.',
        'Tabla por jugador con saque, recepción, ataque, bloqueo y defensa, de todo o set a set.'
      ]
    },
    {
      v: '1.5.8', d: '2026-11-17', t: 'Pruebas jugadas',
      items: [
        'Carrera: las pruebas se juegan: un set a 15 contra rivales mejores y la IA un nivel más.',
        'Te fichan por tu nota; ganar el mini partido ayuda un poco. También puedes simularla.',
        'Clubes mejores te invitan a prueba a mitad y a final de temporada, en playa y en pista.'
      ]
    },
    {
      v: '1.5.7', d: '2026-11-17', t: 'Moverte en el saque',
      items: [
        '6 contra 6: muévete en el saque en todos los niveles; si te solapas, falta de posición.',
        'En Fácil y Normal, una marca en el suelo te enseña tu sitio legal mientras sacan.',
        'Los botes ya no dejan marca en el suelo: lo que se discute se mira en el challenge.'
      ]
    },
    {
      v: '1.5.6', d: '2026-11-17', t: 'Beta abierta',
      items: [
        'Make the Cut entra en beta abierta: gracias por probarlo y contarnos qué falla.'
      ]
    },
    {
      v: '1.5.5', d: '2026-11-17', t: 'Arreglos del online',
      items: [
        'Arreglado: con mando no había forma de salir del final de un partido online.',
        'Arreglado: si los dos recargabais a la vez, el partido se quedaba en «Volviendo…».',
        'Arreglado: la hoja final online no cuadraba tras un corte jugado contra la IA.',
        '«Colocación dirigida» de Ajustes también vale en el online.'
      ]
    },
    {
      v: '1.5.4', d: '2026-11-17', t: 'Repeticiones online',
      items: [
        'Online: repetición y «Mejores jugadas» en la hoja final, cada cual desde su lado.',
        'Si quien creó la sala recarga en mitad del partido, vuelve a él y se sigue jugando.',
        '«Crear sala» nueva: ves cómo saldrá tu sala en la lista y eliges los puntos en pabellón.'
      ]
    },
    {
      v: '1.5.3', d: '2026-11-17', t: 'Árbitros',
      items: [
        'Los árbitros hacen las señas oficiales, en el orden del reglamento y a la vista.',
        'El 2º árbitro se mueve al lado del equipo que defiende, como en un partido de verdad.'
      ]
    },
    {
      v: '1.5.2', d: '2026-11-17', t: 'Remates y planchas',
      items: [
        'En 6 contra 6 la CPU remata de verdad: se acabaron los ataques suaves que caían solos.',
        'La plancha alcanza menos y el balón sale peor: salvar un balón tarde ya no es gratis.',
        'Colocador: la rápida y el pipe que pides salen aunque la recepción no sea buena.',
        'Colocador: tu timing se nota en el remate; la perfecta es más difícil de defender.',
        'Colocador: la IA no te deja las recepciones y, si tocas tú primero, puedes pedir la bola.'
      ]
    },
    {
      v: '1.5.1', d: '2026-11-16', t: 'Lobby online',
      items: [
        'Lobby online nuevo: las salas salen como una cartelera, con la sede y el «VS» a la vista.',
        'Con mando, el nombre y el código se escriben con un teclado en pantalla.',
        'Si recargas la página en mitad de un partido online, vuelves a él como invitado.',
        'El récord online solo cuenta partidos en los que las dos partidas cuadran al final.'
      ]
    },
    {
      v: '1.5.0', d: '2026-11-16', t: 'Online (beta)',
      items: [
        'Online (beta): juega 1 contra 1 con otra persona, cada una con su n.º 1 y la IA de pareja.',
        'Lobby con las salas abiertas, o entra con el código que te pase tu rival.',
        'Juegas con tus atributos de la Carrera, o en una sala «Igualado».',
        'Entre sets hay 10 s de pausa; si los dos pulsáis «Continuar», se salta.',
        'Tu rival solo ve tu nombre, con una flecha encima de su jugador.',
        'Termina tu primer partido online y llévate la gorra «Online Beta Tester».'
      ]
    },
    {
      v: '1.4.0', d: '2026-11-16', t: 'Colocar con destino',
      items: [
        'Colocar: con la dirección eliges el destino, y lo ves en el suelo antes del toque.',
        'Sin dirección, alta a la 4. Cerca de ti sale rápida; lejos, alta.',
        'La calidad depende de tu timing y de tu Colocación.',
        'Con ratón: clic para golpear, clic derecho para colocar y la rueda para saltar.'
      ]
    },
    {
      v: '1.3.3', d: '2026-11-16', t: 'Jueces de línea',
      items: [
        'Cuatro jueces de línea en las grandes competiciones y ninguno en las categorías de abajo.'
      ]
    },
    {
      v: '1.3.2', d: '2026-11-16', t: 'Reto del día al entrar',
      items: [
        'El reto del día te espera nada más abrir el juego (una vez al día).',
        'Carrera: los partidos dan menos experiencia; con los entrenamientos se subía demasiado.'
      ]
    },
    {
      v: '1.3.1', d: '2026-11-15', t: 'Borrar carrera',
      items: [
        'Borra tu Carrera de playa o de pista desde Ajustes › Info.'
      ]
    },
    {
      v: '1.3.0', d: '2026-11-15', t: 'Tu carrera, tus partidos',
      items: [
        'Carrera con el retrato de tu jugador, escudos de los clubes y vitrina de trofeos.',
        'La Carrera en la portada: sigue donde lo dejaste.',
        'Previa y resumen de jornada como en la tele.',
        'Repeticiones de los puntos de set y de partido, y las mejores jugadas al final.',
        'Jefes del circuito y química de pareja en la Carrera de playa.',
        'Retos de maestría y un reto del día nuevo cada día.',
        'Nivel de perfil y álbum con todo lo que has conseguido.'
      ]
    },
    {
      v: '1.2.0', d: '2026-11-15', t: 'Sedes de club',
      items: [
        'Cada club de las 28 ligas tiene su pabellón y cada club de playa, su playa.',
        'En la Carrera se juega en casa del local; las finales, en las grandes sedes.',
        'Partido rápido: un pabellón distinto en cada partido, o el que elijas.'
      ]
    },
    {
      v: '1.1.2', d: '2026-11-15', t: 'Dificultad en la pista',
      items: [
        'La Carrera de pista ya tiene dificultad: Fácil, Normal, Difícil o Experto.',
        'Elígela al crear la Carrera y cámbiala entre partidos en Palmarés › Opciones.',
        'Cada título guarda la dificultad más fácil de su temporada.'
      ]
    },
    {
      v: '1.1.1', d: '2026-11-15', t: 'Cuentas con correo',
      items: [
        'Crea tu cuenta con tu correo y recupera la contraseña si la olvidas.',
        'Entrar con Google (en cuanto esté activado).',
        'Tu Vestuario también se guarda en tu cuenta.'
      ]
    },
    {
      v: '1.1.0', d: '2026-11-13', t: 'Vestuario',
      items: [
        'Nuevo Vestuario: peinados, gorras, gafas, manguitos, rodilleras y mucho más.',
        'Cada jugador con su aspecto en pista y otro en playa.',
        'Se gana en la Carrera, en el Entrenamiento y en la tienda.',
        'Solo estética: nada cambia cómo juega tu atleta.'
      ]
    },
    {
      v: '1.0.1', d: '2026-11-12', t: 'Arreglos de línea y marcador',
      items: [
        'Arreglado: el challenge da dentro si cualquier parte del balón toca la línea.',
        'Marcador más discreto mientras se juega el punto.',
        'Playa: colocar de dedos a destiempo puede costar dobles.'
      ]
    },
    {
      v: '1.0.0', d: '2026-11-12', t: 'Juego completo',
      items: [
        'Entrenamiento: 5 ejercicios con medallas y peloteo libre.',
        'Carrera de pista 6 contra 6 con ligas de 28 países.',
        'Interfaz nueva con grafismo de tele deportiva.',
        'Teclas y botones reasignables, y más ajustes de cámara e imagen.',
        'Faro, tu mentor, y noticias y fichas de clubes en la Carrera.',
        'Finta, golpe colocado y colocación dirigida para quien quiera más.',
        'Fama, patrocinadores, decisiones y un rival personal en la Carrera.',
        'Premios de temporada, 28 logros y el Salón de la Fama al retirarte.',
        '6 contra 6: juega de receptor, colocador, opuesto o central.',
        'Bloqueo activo: salta y pulsa GOLPEAR justo cuando remata el rival.',
        'Vóley playa en Platja Llarga, con luz de día o de tarde.',
        'Personajes y logotipo nuevos.',
        'Cuentas: guarda tu progreso y sigue en otro dispositivo.'
      ]
    }
  ];

  var MIT_THREE = 'The MIT License\n\n' +
    'Copyright © 2010-2023 Three.js Authors\n\n' +
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated ' +
    'documentation files (the "Software"), to deal in the Software without restriction, including without limitation the ' +
    'rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit ' +
    'persons to whom the Software is furnished to do so, subject to the following conditions:\n\n' +
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the ' +
    'Software.\n\n' +
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE ' +
    'WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR ' +
    'COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR ' +
    'OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';

  var OFL = 'Barlow y Barlow Condensed: Copyright 2017 The Barlow Project Authors (github.com/jpt/barlow).\n\n' +
    'Se distribuyen con la SIL Open Font License, versión 1.1. Se pueden usar, estudiar, modificar y redistribuir ' +
    'libremente, también dentro de otro software, siempre que no se vendan solas y que las versiones modificadas no usen ' +
    'el nombre reservado de la fuente.\n\n' +
    'Texto completo de la licencia: openfontlicense.org';

  /** Créditos. by: solo el nombre (sin apellidos ni correo). tools: líneas de «Hecho con». */
  VB.CREDITS = {
    by: 'Ferran',
    tools: [
      'three.js r149 (motor 3D, licencia MIT)',
      'Sonido y gráficos generados por código, sin grabaciones',
      'Guardado en la nube con Firebase'
    ],
    fonts: 'Barlow y Barlow Condensed, de The Barlow Project Authors (SIL Open Font License 1.1). ' +
      'El logotipo usa sus letras pasadas a trazos.',
    licenses: {
      three: MIT_THREE,   // año comprobado en la cabecera de three.min.js 0.149.0 (cdnjs): «Copyright 2010-2023 Three.js Authors»
      threeLine: 'three.js: Copyright © 2010-2023 Three.js Authors. Licencia MIT.',
      ofl: OFL
    },
    note: 'Clubes, jugadores y patrocinadores son inventados. Cualquier parecido es casualidad.'
  };
})();
