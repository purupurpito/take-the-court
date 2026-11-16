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
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  VB.VERSION = '1.4.0';
  VB.VERSION_DATE = '2026-11-16';

  /** Novedades: {v, d:'AAAA-MM-DD', t (título corto), items[] (frases de 90 caracteres como mucho)}. La más nueva primero. */
  VB.CHANGELOG = [
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
