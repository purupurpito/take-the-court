/* version.js: número de versión, novedades y créditos. Solo datos. Cada versión que cambia algo visible sube VERSION y pone su entrada ARRIBA del CHANGELOG (build-pages falla si no cuadran). Items de 90 caracteres como mucho, sin punto medio, sin arrobas y sin la palabra del programa de navegación (abouttest.js). */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  VB.VERSION = '1.24.0';
  VB.VERSION_DATE = '2026-11-27';

  /** Novedades: {v, d:'AAAA-MM-DD', t (título corto), items[] (frases de 90 caracteres como mucho)}. La más nueva primero. */
  VB.CHANGELOG = [
    {
      v: '1.24.0', d: '2026-11-27', t: 'Un final al día',
      items: [
        '¡Nuevo modo! Situaciones difíciles, solo aptas para quien sepa jugar bajo presión.',
        'Botones de sugerencia y bugs.',
        'Rediseño de menús, que ahora también se ven mejor en el móvil.',
        'Mejoras de cámara.',
        'La CPU mejora si eres repetitivo. ¡Hay que ser versátil para ganar!',
        'Nuevos premios por nivel.',
        'Nuevos controles.',
        '¡Nuevo cursor! Ahora es personalizado.',
        'Pequeño rediseño de los personajes en playa.'
      ]
    },
    {
      v: '1.23.0', d: '2026-11-24', t: 'Online para más de dos',
      items: [
        'Online 2 contra 2 con hasta cuatro personas. Si falta alguien, juega la CPU.',
        '6 contra 6 online con hasta doce. Está en beta: si se rompe, avisadme.',
        'En la sala cada uno coge su sitio, mira su ping y le da a Listo.',
        'Carrera de playa con otra persona de pareja. Ella sube su jugador; la Carrera es tuya.',
        'Funciona sin cobertura una vez abierto con red. El online, no.'
      ]
    },
    {
      v: '1.22.0', d: '2026-11-22', t: 'Para cuando hay prisa',
      items: [
        'La primera vez sale un botón de Jugar ya, para no tragarse los menús.',
        'Partido rápido a un set, a 7 puntos, o empezando en un final apretado.',
        'Los botones táctiles se pueden mover, agrandar, hacer transparentes y poner para zurdos.',
        'La marca de tu jugador, más grande o en alto contraste, en Accesibilidad.',
        'El aro de dónde cae el balón: siempre, solo al final o nunca.',
        'La CPU ya no remata siempre igual.',
        'Si se cierra el juego a mitad de partido, vuelves al mismo punto. En la Carrera también.'
      ]
    },
    {
      v: '1.21.0', d: '2026-11-21', t: 'Xaranga',
      items: [
        'Cada falta sale con su seña, y las que vas viendo se apuntan en tu Cuaderno.',
        'Xaranga en la grada, en la Carrera y en Difícil o Experto. Fuera de casa, la del rival.',
        'La xaranga tiene su propio volumen en Ajustes › Audio.',
        'El mismo 22-24: un final por semana, el mismo para todos, tres intentos al día.',
        'En la Carrera los árbitros tienen nombre.',
        'Si te sale un partidazo, el siguiente rival se lo habrá mirado.',
        'Los clubes de los que te fuiste se acuerdan de ti.',
        'La final de copa se juega en la Cúpula del Far.',
        'Jefes en la Carrera de pista: uno por liga.',
        'El perfil, los retos y la Carrera de pista ya se guardan en la cuenta.'
      ]
    },
    {
      v: '1.20.0', d: '2026-11-21', t: 'Nombre nuevo',
      items: [
        'Make the Cut pasa a llamarse Take the Court y se muda a takethecourt.com.',
        'Si entras por el enlace viejo, tu partida se viene sola.',
        'Si lo tenías instalado, toca instalarlo otra vez. Lo siento.'
      ]
    },
    {
      v: '1.19.2', d: '2026-11-21', t: 'Logo nuevo',
      items: [
        'Logo e icono nuevos. La O de COURT es un balón.'
      ]
    },
    {
      v: '1.19.0', d: '2026-11-20', t: 'Convocado',
      items: [
        'Selección: convocatorias, Mundial y Juegos Cuatrienales, si das la talla.',
        'Lesiones, pocas: unos partidos de baja. Puedes volver antes, pero te arriesgas.',
        'Partido de las Estrellas, Sol contra Luna, con concursos de saque, recepción y remate.',
        'Cesiones: si no juegas, pide salir cedido o el traspaso.',
        'Cada semana ves quién va primero en cada premio de la temporada.',
        'El entrenador te prepara un plan, o te cambia de puesto si se lo pides.',
        'Rachas: si enganchas tres o cuatro buenas seguidas, se nota. Al rival también le pasa.',
        'Saque de firma: eliges cómo sacas y cómo celebras el ace.',
        'La Carrera puede empezar en el instituto, ganándote las pruebas de los clubes.'
      ]
    },
    {
      v: '1.18.0', d: '2026-11-20', t: 'Peluquería',
      items: [
        '32 peinados, y el pelo ya asoma por debajo de la gorra o del pañuelo.',
        'Dos colores de pelo: raíces, puntas, mechas o mitad y mitad.',
        'Más de 40 cosas nuevas: pendientes, cadenas, gafas, manguitos, calcetines...',
        'Botón Probar: tu jugador remata o celebra con lo que llevas puesto.'
      ]
    },
    {
      v: '1.17.0', d: '2026-11-19', t: 'Fintas',
      items: [
        'La finta llega al 6 contra 6 y a la Carrera de pista.',
        'En el aire, Golpear pronto y Saltar justo al golpe. En el móvil, desliza de uno a otro.',
        'Con el bloqueo ya arriba, a la defensa le cuesta mucho leerla.'
      ]
    },
    {
      v: '1.16.0', d: '2026-11-19', t: 'La grada',
      items: [
        'La grada anima, pita al rival y se calla en los puntos de set.',
        'A veces toca elegir: protestar al árbitro o dejarlo estar.',
        'Tarjetas: la amonestación es un aviso; la penalización, punto y saque para el rival.',
        'El ambiente se regula en Ajustes › Juego: completo, tranquilo o apagado.'
      ]
    },
    {
      v: '1.15.1', d: '2026-11-19', t: 'Aviso de versión',
      items: [
        'Si tienes una versión vieja, te avisa y se reinicia con un botón.',
        'En el online dice quién tiene que reiniciar.'
      ]
    },
    {
      v: '1.15.0', d: '2026-11-19', t: 'Planchas',
      items: [
        'La CPU va a por todas: si no llega, es por reacción, velocidad o alcance.',
        'Si no llega por poco, se tira en plancha igual.',
        'Los jugadores arrancan como en una pista de verdad, sin salir disparados.',
        'Velocidad, Reacción, Defensa y Recepción pesan más.'
      ]
    },
    {
      v: '1.14.1', d: '2026-11-18', t: 'Online',
      items: [
        'Online 1 contra 1, cada uno con su jugador y la CPU de pareja. Con código o con lobby.',
        'Dos conexiones: Precisa, que va igual en los dos lados, y Fluida, que responde antes.',
        'Challenge también en el online. El primer partido da la gorra Estuve en la beta.'
      ]
    },
    {
      v: '1.0.0', d: '2026-11-12', t: 'La primera que se podía enseñar',
      items: [
        'Playa 2 contra 2 en Platja Llarga y pista 6 contra 6 con ligas de 28 países.',
        'Carrera con mentor, noticias, fichajes, fama y un rival que te tiene manía.',
        'Entrenamiento con cinco ejercicios y medallas.',
        'Cuentas para seguir la partida en otro aparato.'
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

  var OFL = 'Big Shoulders Display: Copyright 2019 The Big Shoulders Project Authors (github.com/xotypeco/big_shoulders).\n' +
    'Chivo: Copyright 2019 The Chivo Project Authors (github.com/Omnibus-Type/Chivo).\n' +
    'Doto: Copyright 2024 The Doto Project Authors (github.com/oliverlalan/Doto).\n' +
    'Barlow Condensed: Copyright 2017 The Barlow Project Authors (github.com/jpt/barlow).\n' +
    'Anton: Copyright 2020 The Anton Project Authors (github.com/googlefonts/AntonFont).\n' +
    'Bungee: Copyright 2023 The Bungee Project Authors (github.com/djrrb/Bungee).\n\n' +
    'Se distribuyen con la SIL Open Font License, versión 1.1. Se pueden usar, estudiar, modificar y redistribuir ' +
    'libremente, también dentro de otro software, siempre que no se vendan solas y que las versiones modificadas no usen ' +
    'el nombre reservado de la fuente.\n\n' +
    'Texto completo de la licencia: openfontlicense.org';

  /** Créditos. by: solo el nombre (sin apellidos ni correo). tools: líneas de «Hecho con». thanks: lo escribe Ferran. */
  VB.CREDITS = {
    by: 'Ferran',
    tools: [
      'three.js r149 (motor 3D, licencia MIT)',
      'Sonido y gráficos generados por código, sin grabaciones',
      'Guardado en la nube con Firebase (Firebase JS SDK, licencia Apache 2.0)',
      'App de Android con Android Browser Helper y AndroidX (licencia Apache 2.0)'
    ],
    fonts: 'Big Shoulders Display (Patric King), Chivo (Omnibus-Type) y Doto, con la SIL Open Font License 1.1. ' +
      'El rótulo de carga usa Barlow Condensed (The Barlow Project Authors), y el logo, Anton (Vernon Adams) y Bungee ' +
      '(David Jonathan Ross) pasadas a trazos, también con la Open Font License.',
    licenses: {
      three: MIT_THREE,
      threeLine: 'three.js: Copyright © 2010-2023 Three.js Authors. Licencia MIT.',
      ofl: OFL
    },
    thanks: [],
    note: 'Clubes, jugadores, competiciones, árbitros y patrocinadores son ficticios. Cualquier parecido con personas, clubes o competiciones reales es pura coincidencia.'
  };
})();
