/* TAKE THE COURT — js/career-prologue.js (owner: prologo)
 * Prólogo juvenil («Desde juvenil»): una temporada corta con el instituto de tu ciudad antes de las ofertas de inicio de la Carrera
 * (playa y pista). Spec: notes/carrera.md «Prólogo juvenil» y CONTRACT.md «Extensiones de la Carrera».
 *
 * Flujo (c.pro.st): 'intro' (presentación en 3 páginas: tú, tu equipo, tu rival) → 'season' (5 partidos de un set: liguilla de 4
 * institutos con el derbi en la J2, semifinal y final o 3r puesto) → 'scout' (informe de los ojeadores: nota 0-100, nivel e
 * invitaciones a prueba ya en c.offers) → 'done' (elegir club con la pantalla de siempre). 'skip' = «Ir directo a las pruebas».
 * career.js (create/create6 con o.prologue) no genera ofertas y llama a start(c, o); sane/sane6 no las rehacen mientras active(c).
 *
 * Expone:
 *  - VB.CareerPrologue: lógica pura (sin DOM al cargar; se carga en node con vm).
 *  - VB.CareerPrologueUI: HTML en cadenas para el hub (render/act) e inyecta su <style> la primera vez que pinta.
 *  - Registros: VB.CareerExt {id:'pro', hook('join'), setup, done, quit, sheet, _demo, _endDemo} y VB.CareerUIExt {id:'pro',
 *    prefix 'pro-', takeover, render, act, hero, createRow, createLabel, createOpts, offerLine, msgK}.
 * Reglas: estado en c.pro (ensure idempotente, sin tiradas, sin subir VER); azar solo por hash de la semilla
 * (E._rng(E._hash(c.seed, 'pro-…'))), nunca el azar del navegador ni el de la partida; no toca la sim: el partido es un partido normal de la sim.
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};

  // ================================================================== motor y utilidades
  // Motor de la carrera c (como career-life.js K): la playa o una vista «pista sobre playa» (lo común de la playa y lo que la pista redefine).
  var HV = null, HVsrc = null;
  function K(c) {
    var C = VB.Career; if (!C || !C.beach) return C;
    if (!(c && c.mode === 'hall') || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function B() { return VB.Career && (VB.Career.beach || VB.Career); }
  function hallC(c) { return !!(c && c.mode === 'hall'); }
  function rngOf() { var a = Array.prototype.slice.call(arguments), E = B(); return E._rng(E._hash.apply(null, a)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampI(v, a, b) { v = Math.round(+v || 0); return v < a ? a : v > b ? b : v; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function fmt1(v) { return v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function first(n) { return String(n || '').split(' ')[0]; }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function byId(a, b) { return a.id - b.id; }
  function now() { return Date.now(); }

  // ================================================================== datos fijos (todo inventado)
  var SCHOOLS = [['Instituto Faro Viejo', 'FAR'], ['Colegio Las Gaviotas', 'GAV'], ['Instituto Monte Claro', 'MON'], ['Escuela del Molino', 'MOL'],
    ['Instituto Río Verde', 'RIO'], ['Colegio El Pinar', 'PIN'], ['Instituto La Muralla', 'MUR'], ['Colegio Las Dunas', 'DUN'],
    ['Instituto Puerta Norte', 'PNO'], ['Colegio Los Naranjos', 'NAR']];
  // paletas de escuela [camiseta, segundo color, pantalón, líbero, dibujo]: camisetas de tonos bien distintos entre sí
  var PALS = [[0xe63946, 0xffffff, 0x1d3557, 0xffd166, 'franjas'], [0x1d6fd1, 0xffd166, 0x0b2545, 0xff6b6b, 'liso'],
    [0x2a9d8f, 0xf1faee, 0x264653, 0xf4a261, 'rayas'], [0xf4a261, 0x264653, 0x264653, 0x2a9d8f, 'diag'],
    [0x7b2cbf, 0xffd60a, 0x240046, 0x80ffdb, 'franjas'], [0x2b9348, 0xffffff, 0x1b4332, 0xff70a6, 'liso'],
    [0xffd60a, 0x000814, 0x003566, 0xe63946, 'rayas'], [0xff70a6, 0x3a0ca3, 0x3a0ca3, 0x70e000, 'diag']];
  var COACHES = {
    sarg: { name: 'El del silbato', nameF: 'La del silbato', fem: ['Maite Olano'], ns: ['Maite Olano', 'Ramón Ezcurra'], line: 'Silbato al cuello y cero excusas. Si llegas tarde, corres. Si llegas pronto, también.' },
    poeta: { name: 'El exjugador de la rodilla', nameF: 'La exjugadora de la rodilla', fem: ['Lola Arrieta'], ns: ['Toni Bergara', 'Lola Arrieta'], line: 'Jugó en la élite hasta que la rodilla dijo basta. Explica la recepción con recetas de cocina.' },
    datos: { name: 'El del Excel', nameF: 'La del Excel', fem: ['Rosa Quintana'], ns: ['Rosa Quintana', 'Iñaki Soler'], line: 'Libreta de colores y una estadística para todo. Sabe cuántos saques fallaste el curso pasado.' },
    opti: { name: 'El que grita', nameF: 'La que grita', fem: ['Nuria Calvet'], ns: ['Chema Urrutia', 'Nuria Calvet'], line: 'Optimismo sin fin. Grita «¡vamos, familia!» hasta perdiendo 0-10.' }
  };
  var COACH_K = ['sarg', 'poeta', 'datos', 'opti'];
  function coachTag(co) { var C0 = COACHES[co.p]; return C0.fem.indexOf(co.n) >= 0 ? C0.nameF : C0.name; }
  var FRIENDS = ['Sasha Merino', 'Noa Lastra', 'Iker Bosque', 'Lu Carrasco', 'Ari Montes', 'Jon Telmo', 'Vera Ocaña', 'Dani Rius'];
  var RIVALS = ['Bruno Salcedo', 'Kai Navarro', 'Mara Villalta', 'Teo Arribas', 'Nil Castell', 'Gala Ortuño', 'Unai Brea', 'Iris Pons'];
  var RIVAL_STORY = {
    saque: 'Te ganó la final de saques del campus de verano cuando teníais 11 años. Aún lo cuenta.',
    muro: 'Te puso tres bloqueos seguidos en el patio y desde entonces se hace llamar «la pared».',
    remate: 'Dice que rompió una canasta de un remate a los 13. Nadie lo vio.',
    defensa: 'No hay balón que no toque. Ni el tuyo. Sobre todo el tuyo.'
  };
  var STYLE_NAME = { saque: 'Cañón', muro: 'Muro', remate: 'Martillo', defensa: 'Pulpo' };
  var STYLE_BASE = { saque: 'atk', muro: 'atk', remate: 'atk', defensa: 'cr' };
  var MATE_ROLE = { atk: 'cr', cr: 'atk', uni: 'cr' };
  var PERS = {
    work: { name: 'Currante', hint: 'Primero en llegar, último en irse', gift: '+25 de progreso en los tres entrenos' },
    show: { name: 'Artista', hint: 'Si no hay público, te lo inventas', gift: '+150 seguidores' },
    lead: { name: 'Líder', hint: 'Hablas más que el entrenador', gift: '+10 de química en tu primer club, si el vestuario te escucha' }
  };
  var PERS_K = ['work', 'show', 'lead'];
  // niveles del informe de los ojeadores: puntuación mínima, invitaciones seguras, bono de probabilidad y seguidores
  var TIER = {
    joya: { name: 'Joya', min: 88, n: 3, bonus: 0.15, fame: 200 },
    promesa: { name: 'Promesa', min: 70, n: 2, bonus: 0.10, fame: 120 },
    inter: { name: 'Interesante', min: 50, n: 1, bonus: 0.05, fame: 60 },
    monton: { name: 'Del montón', min: 25, n: 0, bonus: 0, fame: 0 },
    nadie: { name: 'Invisible', min: 0, n: 0, bonus: 0, fame: 0 }
  };
  var TIER_K = ['nadie', 'monton', 'inter', 'promesa', 'joya'];
  var CHANCE_MAX = 0.8;
  // peldaño de la IA (K.STEPS) según la dificultad de la Carrera: más fácil que en la Carrera; la final, uno más
  var PRO_AI = { easy: 0, normal: 0, hard: 1, expert: 2 };
  // objetivos por puesto [A, B, C]: [estadística de ingest (M.p[0]), cantidad] (más fáciles que los de la prueba)
  var GOALS = {
    atk: [['kills', 2], ['kills', 3], ['blocks', 1]], uni: [['kills', 2], ['perfect', 2], ['aces', 1]], cr: [['digs', 3], ['perfect', 2], ['digs', 4]],
    OH: [['kills', 2], ['recvP', 2], ['kills', 3]], OPP: [['kills', 2], ['aces', 1], ['kills', 4]], MB: [['blocks', 1], ['kills', 2], ['blocks', 2]],
    S: [['assists', 4], ['assists', 6], ['aces', 1]]
  };
  // (copia de TRIAL_WORD de career.js, que no se exporta: mismo plural)
  var WORD = { kills: ['remate ganado', 'remates ganados'], blocks: ['bloqueo punto', 'bloqueos punto'], errors: ['error', 'errores'],
    perfect: ['toque perfecto', 'toques perfectos'], digs: ['defensa', 'defensas'], recvP: ['recepción perfecta', 'recepciones perfectas'],
    aces: ['ace', 'aces'], assists: ['asistencia', 'asistencias'], poor: ['toque flojo', 'toques flojos'] };
  // fuerza de cada instituto respecto a tu media (0 = el tuyo, 1 = A débil, 2 = B, 3 = R el del rival): para simular
  var OFF = { beach: [-0.5, -5, -3, 0.5], hall: [-2.2, -6, -4, -1.5] };
  // la nota de la pista sale más alta (escala por puesto): como TRIAL_CUT_D de career.js, los cortes de nota se mueven por modalidad
  var NOTA_D = { beach: -0.3, hall: 0.5 };
  // calibrado con partidos de la sim (bots novato / medio / bueno de tools/simtest.js, 6 recorridos por bot y modalidad, 20-nov):
  // la nota cuenta entera a partir de NOTA_0 + 3,5 + NOTA_D (playa 8,7, pista 9,5); objetivos de nota 7,0 / 7,3 (+ NOTA_D) y Joya
  // desde 88. Queda: bueno → Joya casi siempre, medio → Promesa (Joya si gana los 5), novato → Del montón o Interesante.
  var NOTA_0 = 5.5;
  var MATCH = {
    j1: { lbl: 'Jornada 1', short: 'J1', pts: 15 }, j2: { lbl: 'Jornada 2: el derbi', short: 'J2', pts: 15 }, j3: { lbl: 'Jornada 3', short: 'J3', pts: 15 },
    sf: { lbl: 'Semifinal', short: 'Semi', pts: 15 }, f: { lbl: 'La final', short: 'Final', pts: 21 }, p3: { lbl: 'Por el 3r puesto', short: '3r puesto', pts: 15 }
  };
  var OTHER = [[3, 2], [1, 2], [1, 3]];   // cruces de los demás en cada jornada de la liguilla (R-B, A-B, A-R)
  var ST = ['intro', 'season', 'scout', 'done', 'skip'];
  var CHAT_MAX = 30, FOLLOW = 0.6;   // (te persigue al cambiar de liga: 0,6 aquí + 0,5 de career-life = 0,8)
  var AV = { coach: '#ff9f1c', friend: '#1fb5a8', rival: '#e4572e', fam: '#ff6b8b', team: '#3a86ff', agent: '#7b61ff' };

  // Chat del equipo: plantillas por remitente. x = variantes; xc = por personalidad del entrenador; xp = por tu personalidad.
  // La variante sale de hash(seed, 'pro-v', b, i) (sin tirar). Variables: {yo} {amigo} {rival} {coach} {school} {rschool} {opp}
  // {cup} {lg} {ciudad} {sitio} {nota} {n} {w}. Frases cortas, ≤ 140 caracteres.
  var CH = {
    intro_team: { k: 'team', x: ['{coach} ha creado el grupo «Juvenil {ciudad}»'] },
    intro_coach: { k: 'coach', xc: {
      sarg: ['Fotocopia del DNI y la autorización firmada antes del viernes, que si no no os puedo tramitar la ficha. Las 9 son las 8:45.'],
      poeta: ['Fotocopia del DNI y la autorización firmada antes del viernes, que si no no os puedo tramitar la ficha. Entreno a las 9.'],
      datos: ['Fotocopia del DNI y la autorización firmada antes del viernes, que si no no os puedo tramitar la ficha. Entreno a las 9.'],
      opti: ['Fotocopia del DNI y la autorización firmada antes del viernes, que si no no os puedo tramitar la ficha. Entreno a las 9.'] } },
    intro_friend: { k: 'friend', x: ['¡Por fin en el mismo equipo! Este año el {cup} es nuestro.', '¿Has visto el calendario? El derbi es en la jornada 2. Ya me sudan las manos.'] },
    pers_coach: { k: 'coach', xp: {
      work: ['{yo}, me dicen que llegas antes que yo a los entrenos. Eso se acaba: ahora llego a las 6.'],
      show: ['{yo}, me cuentan que celebras los puntos de entreno como finales. Aquí se celebra después.'],
      lead: ['{yo}, me dicen que hablas mucho en la pista. Bien. Que se te oiga hasta en la grada.'] } },
    pre_j1_coach: { k: 'coach', xc: {
      sarg: ['Mañana a las 9 en {sitio}. Las 9 son las 8:45.'],
      poeta: ['Mañana debutamos. La recepción es como un huevo: ni la aprietes ni la dejes caer.'],
      datos: ['Mañana, {opp}. El curso pasado fallaron 31 recepciones. Treinta y una.'],
      opti: ['¡Mañana debutamos, familia! Si ganamos, bien. Si no, también. Pero mejor ganar.'] } },
    pre_j1_friend: { k: 'friend', x: ['¿Nervios? He desayunado dos veces sin darme cuenta.', 'Mañana me pongo las rodilleras de la suerte. Las lavé. Creo.'] },
    post_w_coach: { k: 'coach', xc: {
      sarg: ['Bien. Mañana, a las 8:45. Ya sabes.', 'Correcto. No te emociones, que aún queda.'],
      poeta: ['Buen partido. El jueves repasamos la recepción, que hoy ha habido sustos.', 'Bien. Estirad antes de iros, que mañana hay clase.'],
      datos: ['Nota {nota}. La apunto en verde.', 'Victoria. Ya van {w}. Lo tengo todo apuntado.'],
      opti: ['¡ESO ES, FAMILIA! Mañana más.', '¡Qué orgullo! Me he quedado sin voz y sin uñas.'] } },
    post_w_friend: { k: 'friend', x: ['¡Qué partidazo! Esta noche no duermo.', '¿Has visto mi saque del final? Dime que lo has visto.', 'Ganar contigo es lo mejor. Bueno, y el bocadillo de después.'] },
    post_l_coach: { k: 'coach', xc: {
      sarg: ['Hoy no. Mañana, vídeo a las 8:45.', 'Derrota. Se acepta y se corrige. En ese orden.'],
      poeta: ['Se nos ha quemado el arroz. Pasa en las mejores cocinas.', 'Hoy no ha salido. El jueves lo vemos con calma.'],
      datos: ['Nota {nota}. La apunto en lápiz: se puede borrar.', 'Derrota. Los números dicen que el próximo toca ganar.'],
      opti: ['Perder también se entrena. Mañana, más.', '¡Cabeza alta! Y mañana, el que llegue tarde hincha los balones.'] } },
    post_l_friend: { k: 'friend', x: ['Bah. El próximo lo ganamos. Lo he soñado.', 'Pizza y a olvidarlo. Pago yo. Bueno, a medias.'] },
    sim_coach: { k: 'coach', xc: {
      sarg: ['Resultado apuntado. Yo quiero verlo, no que me lo cuenten.'],
      poeta: ['Me han pasado el resultado. Prefiero verlo desde el banquillo.'],
      datos: ['Tengo el resultado, pero ninguna estadística tuya. Nadie te ha visto.'],
      opti: ['¡Partido jugado! Bueno, eso dicen. Ningún ojeador lo vio.'] } },
    pre_j2_rival: { k: 'rival', x: ['Dicen que el derbi lo ganáis. Lo dicen en vuestro instituto, claro.', 'Te he guardado sitio en la red. Para pasarte por encima.'] },
    pre_j2_coach: { k: 'coach', xc: {
      sarg: ['Es el derbi. Me da igual. Es un partido. Gana quien menos falla.'],
      poeta: ['Un derbi es como una paella en domingo: todos opinan y nadie la hace bien.'],
      datos: ['{rival} remata casi siempre en diagonal. Ya sabes dónde ponerte.'],
      opti: ['¡DERBI! Pintaos la cara. Bueno, mejor no, que luego se corre.'] } },
    post_j2_w_rival: { k: 'rival', x: ['Suerte de principiante. Nos vemos en el {cup}.', 'Disfrútalo. En el torneo no pasará.'] },
    post_j2_w_friend: { k: 'friend', x: ['¡Le hemos ganado a {rival}! Lo voy a contar en mi boda.'] },
    post_j2_l_rival: { k: 'rival', x: ['Como en el campus. Algunas cosas no cambian.', 'Buen intento. De verdad. Bueno, de verdad no.'] },
    post_j2_l_friend: { k: 'friend', x: ['Ha tenido suerte. Y un poco más de saque. Pero sobre todo suerte.'] },
    pre_j3_friend: { k: 'friend', x: ['Si ganamos la última, entramos mejor al torneo. Hoy no fallo ni una.', 'Último de la liguilla. Me he aprendido de memoria los saques de {opp}.'] },
    pre_sf_coach: { k: 'coach', xc: {
      sarg: ['Hay ojeadores. No me importa. A mí me importa la colocación.'],
      poeta: ['Hay ojeadores en la grada. Jugad como en el entreno del jueves.'],
      datos: ['Tres ojeadores en la grada. Ya he apuntado de qué clubes son. Vosotros, a lo vuestro.'],
      opti: ['Hay ojeadores. No los miréis. Bueno, una vez y ya.'] } },
    pre_sf_fam: { k: 'fam', x: ['Mañana vamos todos. Tu tía ha pedido el día libre. Para ella ya eres profesional.'] },
    post_sf_w_friend: { k: 'friend', x: ['¡A LA FINAL! Ya he avisado a medio instituto.'] },
    post_sf_l_friend: { k: 'friend', x: ['La semi duele. Mañana lo arreglamos con un bronce.'] },
    pre_f_coach: { k: 'coach', xc: {
      sarg: ['Final. Lo de siempre: saque dentro y cabeza fría.'],
      poeta: ['La final es el postre. Nadie se va sin postre.'],
      datos: ['Final a 21. Seis puntos más que de costumbre. He hecho los cálculos: nos sobran.'],
      opti: ['¡UNA FINAL! Respirad. Yo no puedo, pero el equipo sí.'] } },
    pre_f_world: { k: 'friend', world: 1, x: ['En la grada está Álex Marí, Faro. Doce temporadas en la élite. Dicen que ha venido a ver a alguien.'] },
    pre_f_fam: { k: 'fam', x: ['Vamos todos. La abuela ha hecho una pancarta. No te asustes.'] },
    pre_p3_coach: { k: 'coach', xc: {
      sarg: ['Mañana, el bronce. Un bronce también pesa.'],
      poeta: ['No hay final, pero hay bronce. Y el bronce se lleva a casa igual.'],
      datos: ['Por el 3r puesto. Los ojeadores siguen en la grada. Los he contado.'],
      opti: ['Mañana, el bronce. El bronce brilla si lo frotas.'] } },
    pre_p3_fam: { k: 'fam', x: ['Mañana también vamos. La pancarta vale para un bronce. La abuela dice que sí.'] },
    post_f_w_friend: { k: 'friend', x: ['¡CAMPEONES! Voy a dormir con la medalla puesta.'] },
    post_f_w_fam: { k: 'fam', x: ['La abuela ha llorado y luego ha preguntado si te pagan.'] },
    post_f_l_friend: { k: 'friend', x: ['Plata. Suena a poco, pero es de plata de verdad. Bueno, pintada.'] },
    post_p3_w_friend: { k: 'friend', x: ['¡Bronce! Medalla es medalla. Me la cuelgo hasta para dormir.'] },
    post_p3_l_friend: { k: 'friend', x: ['Cuartos. Pero qué temporada, ¿eh? Qué temporada.'] },
    end_rival: { k: 'rival', x: ['{cup} terminado. Dicen que hay clubes preguntando por ti. Por mí también. Nos vemos.', 'Esto no acaba aquí. Te espero en la liga.'] },
    end_friend: { k: 'friend', x: ['Prométeme que cuando salgas en la tele me saludarás.', 'Vayas donde vayas, el grupo del juvenil no se borra.'] },
    end_coach: { k: 'coach', xc: {
      sarg: ['Buen trabajo. No te lo diré dos veces, así que léelo dos veces.'],
      poeta: ['Te vas a un club grande. Allí no te van a esperar. Llega pronto.'],
      datos: ['{n} partidos, nota media {nota}. Te guardo una página en la libreta.'],
      opti: ['Ha sido un honor, familia. Un honor enorme. Voy a llorar un poquito.'] } }
  };
  var MOMENTS = {
    intro: ['intro_team', 'intro_coach', 'intro_friend'],
    season: ['pers_coach', 'pre_j1_coach', 'pre_j1_friend'],
    post_w: ['post_w_coach', 'post_w_friend'], post_l: ['post_l_coach', 'post_l_friend'],
    pre_j2: ['pre_j2_rival', 'pre_j2_coach'],
    post_j2_w: ['post_j2_w_rival', 'post_j2_w_friend'], post_j2_l: ['post_j2_l_rival', 'post_j2_l_friend'],
    pre_j3: ['pre_j3_friend'],
    pre_sf: ['pre_sf_coach', 'pre_sf_fam'],
    post_sf_w: ['post_sf_w_friend'], post_sf_l: ['post_sf_l_friend'],
    pre_f: ['pre_f_coach', 'pre_f_world', 'pre_f_fam'], pre_p3: ['pre_p3_coach', 'pre_p3_fam'],
    post_f_w: ['post_f_w_friend', 'post_f_w_fam'], post_f_l: ['post_f_l_friend'], post_p3_w: ['post_p3_w_friend'], post_p3_l: ['post_p3_l_friend'],
    end: ['end_rival', 'end_friend', 'end_coach']
  };
  // frase del entrenador en la tarjeta del próximo partido (por partido y personalidad)
  var LINES = {
    j1: { sarg: 'Saque dentro y a correr. No pido más. Bueno, sí: no llegues tarde.', poeta: 'Primer partido. Que entre el saque y lo demás ya vendrá.',
      datos: '{opp} recibe mal por la zona 5. Saca ahí. Lo tengo apuntado.', opti: '¡Primer partido de la temporada! Disfrutad, que esto pasa volando.' },
    j2: { sarg: 'Es un derbi. Para mí, un partido más. Para ti, también.', poeta: 'Un derbi es como una paella en domingo: todos opinan y nadie la hace bien.',
      datos: '{rival} remata casi siempre en diagonal. Ya sabes dónde ponerte.', opti: '¡DERBI, familia! Que se oiga desde la otra punta de la ciudad.' },
    j3: { sarg: 'Último de la liguilla. Ganarlo da mejor cruce. Sin excusas.', poeta: 'Cerramos la liguilla. Ganar da mejor cruce.',
      datos: 'Si ganamos, cruce más cómodo en el torneo. He hecho las cuentas tres veces.', opti: 'Último de liga. ¡Vamos a por él con todo!' },
    sf: { sarg: 'Hay ojeadores. Me da igual. A ti también te tiene que dar igual.', poeta: 'Hay gente mirando desde la grada. Juega como si no hubiera nadie.',
      datos: 'Tres ojeadores en la grada. Ya he apuntado de qué clubes son.', opti: 'Hay ojeadores. No los miréis. Bueno, una vez y ya.' },
    f: { sarg: 'Final a 21. Seis puntos más para equivocarse menos.', poeta: 'La final es el postre. Nadie se va sin postre.',
      datos: 'Final a 21. He calculado que nos sobran puntos. Cuatro, más o menos.', opti: '¡UNA FINAL! Respirad. Yo no puedo, pero el equipo sí.' },
    p3: { sarg: 'El bronce también pesa. Quiero verlo colgado.', poeta: 'No hay final, pero hay bronce. Se lleva a casa igual.',
      datos: 'Por el 3r puesto. Los ojeadores siguen en la grada. Los he contado.', opti: 'El bronce brilla si lo frotas.' }
  };
  var AGENT_TX = {
    joya: 'Después del {cup} no paran de llamarme: {n} ofertas y {t} pruebas, una en {liga}. No te lo creas mucho. Bueno, un poco sí.',
    joya6: 'Después del {cup} no paran de llamarme: {n} ofertas y {t} pruebas en {liga}, una en un club de arriba. No te lo creas mucho.',
    promesa: 'Tienes {n} ofertas y te invitan a 2 pruebas en {liga}. Los ojeadores apuntaron tu nombre con letra grande.',
    inter: 'Tienes {n} ofertas y una prueba en {liga}. Les gustó lo que vieron en el {cup}.',
    monton: 'Tienes {n} ofertas{yp}. Los ojeadores te vieron, pero no se mojan. Toca demostrarlo en la liga.',
    nadie: 'Tienes {n} ofertas de clubes modestos. En el torneo no salió. La liga es otra historia.',
    skip: 'Tienes {n} ofertas{yp} para la temporada 1. Compara las fichas antes de firmar: el club, el rol, el sueldo y el objetivo.'
  };

  // ================================================================== estado (c.pro)
  function story() { return !!(VB.CareerStory); }
  function lowLid(c) { var E = K(c); return E.league && E.league(c.cc + '2', c) ? c.cc + '2' : c.cc + '1'; }
  function myPos(c) { if (hallC(c)) { var E = K(c); return E.ctrlRole ? E.ctrlRole(c) : (c.player.roleKey || 'OH'); } return c.player && c.player.roleKey || 'uni'; }
  function roleName(c, k) { var E = K(c); if (hallC(c)) { var P = E.POS || VB.Career.POS6 || {}; return P[k] ? P[k].name : k; } var R = E.ROLES || {}; return R[k] ? R[k].name : k; }

  /** Reparto (se guarda como texto la primera vez: una versión nueva de las listas no cambia una partida empezada). */
  function buildCast(c) {
    var E = K(c), hall = hallC(c), r = rngOf(c.seed, 'pro-cast'), city = '', ks = [];
    try { ks = (hall ? E.leagueClubs(c, lowLid(c)) : E.clubsOf(c, 0)) || []; } catch (e) { ks = []; }
    ks = ks.slice().sort(byId);
    if (ks.length) { var k0 = pick(r, ks); city = String(k0.city || ''); }
    if (!city) city = 'Puerto Alto';
    var si = SCHOOLS.map(function (x, j) { return j; }), pj = PALS.map(function (x, j) { return j; });
    for (var a = si.length - 1; a > 0; a--) { var b = Math.floor(r() * (a + 1)); var t = si[a]; si[a] = si[b]; si[b] = t; }
    for (var a2 = pj.length - 1; a2 > 0; a2--) { var b2 = Math.floor(r() * (a2 + 1)); var t2 = pj[a2]; pj[a2] = pj[b2]; pj[b2] = t2; }
    var sch = [0, 1, 2, 3].map(function (j) { var S = SCHOOLS[si[j]], P = PALS[pj[j]]; return { n: S[0], ab: S[1], kit: [P[0], P[1], P[2]], lib: P[3], pat: P[4] }; });
    var cp = pick(r, COACH_K), coach = { n: pick(r, COACHES[cp].ns), p: cp };
    var me = c.player || {}, used = {}, names = {}; used[me.num | 0] = 1; used[13] = 1; names[me.name] = 1;
    var numIn = function (lo, hi) { var n, g = 0; do { n = lo + Math.floor(r() * (hi - lo + 1)); } while (used[n] && g++ < 60); if (used[n]) { n = 1; while (used[n]) n++; } used[n] = 1; return n; };
    var nameOf = function (list) { var n, g = 0; do { n = pick(r, list); } while (names[n] && g++ < 40); names[n] = 1; return n; };
    var pos = myPos(c);
    var friend = { n: nameOf(FRIENDS), num: numIn(1, 20), pos: hall ? (pos !== 'S' ? 'S' : 'OH') : (MATE_ROLE[pos] || 'cr') };
    var rn = nameOf(RIVALS), L = VB.CareerLife, style = L && L.rivalStyleOf ? L.rivalStyleOf(rn) : 'saque';
    if (!RIVAL_STORY[style]) style = 'saque';
    var rival = { n: rn, num: numIn(2, 20), style: style, pos: hall ? pos : STYLE_BASE[style] };
    var mates = [];
    if (hall) {
      var R = E.simRoles ? E.simRoles() : ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'], mi = R.indexOf(pos), fi = -1;
      if (mi < 0) mi = 0;
      for (var j = 0; j < R.length; j++) if (j !== mi && R[j] === friend.pos) { fi = j; break; }
      var H = VB.Career.hall, nm = function () { var s, g = 0; do { s = H && H._name ? H._name(r) : 'Jugador ' + (g + 1); } while (names[s] && g++ < 40); names[s] = 1; return s; };
      for (var j2 = 0; j2 < R.length; j2++) if (j2 !== mi && j2 !== fi) mates.push({ n: nm(), num: numIn(1, 20), pos: R[j2] });
    }
    var comp = hall ? { lg: 'Liga Escolar de ' + city, cup: 'Torneo Promesas' } : { lg: 'Liga Juvenil de Arena de ' + city, cup: 'Open Promesas' };
    return { city: city, sch: sch, coach: coach, friend: friend, mates: mates, rival: rival, comp: comp };
  }
  function castOk(x, hall) {
    if (!obj(x) || typeof x.city !== 'string' || !Array.isArray(x.sch) || x.sch.length !== 4) return false;
    if (!x.sch.every(function (s) { return obj(s) && typeof s.n === 'string' && typeof s.ab === 'string' && Array.isArray(s.kit) && s.kit.length >= 3; })) return false;
    if (!obj(x.coach) || !COACHES[x.coach.p] || typeof x.coach.n !== 'string') return false;
    if (!obj(x.friend) || typeof x.friend.n !== 'string' || !obj(x.rival) || typeof x.rival.n !== 'string' || !RIVAL_STORY[x.rival.style]) return false;
    if (!obj(x.comp) || typeof x.comp.lg !== 'string' || typeof x.comp.cup !== 'string' || !Array.isArray(x.mates)) return false;
    if (hall && x.mates.length !== 4) return false;
    return true;
  }

  // ---- objetivos (2 por partido: 'stat' de M.p[0], 'win' y 'nota')
  function gStat(g, op) {
    op = op || '>='; var w = WORD[g[0]] || [g[0], g[0]], t = plural(g[1], w[0], w[1]);
    return { id: g[0], kind: 'stat', stat: g[0], op: op, n: g[1], txt: op === '<=' ? 'Como mucho ' + t : cap(t) };
  }
  function gWin(t) { return { id: 'win', kind: 'win', txt: t }; }
  function gNota(n) { return { id: 'nota', kind: 'nota', n: n, txt: 'Nota de ' + fmt1(n) + ' o más' }; }
  function goalsFor(c, id) {
    var pos = myPos(c), G = GOALS[pos] || GOALS[hallC(c) ? 'OH' : 'uni'], d = NOTA_D[hallC(c) ? 'hall' : 'beach'];
    if (id === 'j1') return [gStat(G[0]), gWin('Gana el partido')];
    if (id === 'j2') return [gWin('Gana el derbi'), gStat(['errors', 2], '<=')];
    if (id === 'j3') return [gStat(G[1]), gNota(round1(7 + d))];
    if (id === 'sf') return [gNota(round1(7.3 + d)), gStat(G[2])];
    if (id === 'f') return [gWin('Gana la final'), gStat([G[2][0], G[2][1] + 1])];
    if (id === 'p3') return [gWin('Gana el bronce'), gNota(round1(7 + d))];
    return [];
  }
  function newSched(c) {
    var e = function (id, opp) { return { id: id, opp: opp, pts: id ? MATCH[id].pts : 15, goals: id ? goalsFor(c, id) : [], res: null }; };
    return [e('j1', 1), e('j2', 3), e('j3', 2), e('sf', -1), e('', -1)];
  }
  function resOk(r) { return obj(r) && Array.isArray(r.sc) && r.sc.length === 2 && Array.isArray(r.ok); }

  /** c.pro idempotente y sin tiradas (null si la carrera no tiene prólogo). Repara lo que esté dañado. */
  function ensure(c) {
    if (!c || typeof c !== 'object' || c.pro == null) return null;
    if (!obj(c.pro)) { delete c.pro; return null; }
    var p = c.pro, hall = hallC(c);
    p.v = 1;
    // (versión anterior: la invitación del juvenil iba en o.scout, que career-ui pinta como «Te vio un ojeador»; ahora va en o.pscout)
    if (Array.isArray(c.offers)) c.offers.forEach(function (o) { if (o && obj(o.scout)) { if (!obj(o.pscout)) o.pscout = o.scout; if (hall) o.scout = false; else delete o.scout; } });
    if (ST.indexOf(p.st) < 0) {
      p.st = 'done';
      if (c.phase === 'pick' && !(Array.isArray(c.offers) && c.offers.length)) { try { c.offers = baseOffers(c); } catch (e) { } }
    }
    p.pg = clampI(p.pg, 0, 2);
    p.i = clampI(p.i, 0, 5);
    p.live = 0;   // (al cargar nunca hay un partido en curso: el abandonado se queda pendiente)
    if (PERS_K.indexOf(p.pers) < 0) p.pers = '';
    if (!castOk(p.cast, hall)) p.cast = buildCast(c);
    if (!Array.isArray(p.ot)) p.ot = [];
    p.ot = p.ot.filter(function (o) { return Array.isArray(o) && o.length === 5 && o.every(function (v) { return typeof v === 'number' && isFinite(v); }); });
    if (!Array.isArray(p.m) || p.m.length !== 5 || !p.m.every(function (m) { return obj(m) && Array.isArray(m.goals); })) fixSched(c);
    if (!Array.isArray(p.h2h) || p.h2h.length !== 2) p.h2h = [0, 0];
    p.h2h = [Math.max(0, p.h2h[0] | 0), Math.max(0, p.h2h[1] | 0)];
    if (!Array.isArray(p.chat)) p.chat = [];
    p.chat = p.chat.filter(function (x) { return obj(x) && CH[x.b]; }).slice(-CHAT_MAX);
    if (!(typeof p.score === 'number' && isFinite(p.score))) p.score = null;
    if (TIER_K.indexOf(p.tier) < 0) p.tier = '';
    p.perk = p.perk ? 1 : 0; p.lead = p.lead ? 1 : 0;
    if (p.st === 'season' && p.i >= 5) { p.st = 'done'; if (c.phase === 'pick' && !(c.offers || []).length) { try { c.offers = baseOffers(c); } catch (e) { } } }
    return p;
  }
  /** Calendario dañado: se rehace conservando los resultados válidos (por id y en orden). */
  function fixSched(c) {
    var p = c.pro, old = Array.isArray(p.m) ? p.m : [], m = newSched(c), i = 0;
    p.m = m; p.ot = []; p.h2h = [0, 0];
    for (var j = 0; j < 3; j++) {
      var o = old[j];
      if (!(obj(o) && o.id === m[j].id && resOk(o.res))) break;
      m[j].res = o.res; i = j + 1; if (m[j].opp === 3) { if (o.res.w) p.h2h[0]++; else p.h2h[1]++; } simOthers(c, j);
    }
    if (i === 3) setSemi(c);
    p.i = i;
  }
  /** ¿Prólogo en marcha? (fase pick y c.pro en intro, season o scout). Pura: la llama sane al cargar. */
  function active(c) { return !!(c && c.phase === 'pick' && obj(c.pro) && (c.pro.st === 'intro' || c.pro.st === 'season' || c.pro.st === 'scout')); }
  /** Llamada por create/create6 con o.prologue: deja c.pro en 'intro' (sin ofertas: llegan con el informe). */
  function start(c, o) {
    c.pro = { v: 1, st: 'intro', pg: 0, pers: '', cast: null, m: null, ot: [], i: 0, live: 0, h2h: [0, 0], chat: [], score: null, tier: '', perk: 0, lead: 0 };
    c.pro.cast = buildCast(c);
    c.pro.m = newSched(c);
    say(c, 'intro', 0);
    return c.pro;
  }

  // ================================================================== fuerza, simulación, tabla y cuadro
  function str(c, t) { return K(c).playerOvr(c) + OFF[hallC(c) ? 'hall' : 'beach'][t]; }
  function pWin(a, b) { return 1 / (1 + Math.exp(-(a - b) / 3)); }
  /** Marcador verosímil de un set a pts (el ganador primero si aWins). */
  function scoreOf(r, pts, aWins) {
    var lo = Math.round(pts * (0.4 + 0.5 * r())), hi = pts;
    if (lo >= pts - 1) { lo = pts - 1 + Math.floor(r() * 3); hi = lo + 2; }
    return aWins ? [hi, lo] : [lo, hi];
  }
  function playOther(c, round, a, b, pts) {
    var r = rngOf(c.seed, 'pro-ot', round, a, b), w = r() < pWin(str(c, a), str(c, b)), sc = scoreOf(r, pts, w);
    c.pro.ot.push([round, a, b, sc[0], sc[1]]);
  }
  function otOf(c, round) { return c.pro.ot.filter(function (o) { return o[0] === round; }); }
  /** Partidos de los demás institutos en la ronda i (0-2 liguilla, 3 la otra semi, 4 la final o el 3r puesto de los demás). */
  function simOthers(c, i) {
    var p = c.pro;
    if (otOf(c, i).length) return;
    if (i < 3) { playOther(c, i, OTHER[i][0], OTHER[i][1], 15); return; }
    var semi = semis(c); if (!semi) return;
    var other = semi[0].indexOf(0) >= 0 ? semi[1] : semi[0];
    if (i === 3) { playOther(c, 3, other[0], other[1], 15); return; }
    var os = otOf(c, 3)[0], m3 = p.m[3], m4 = p.m[4]; if (!os || !m3.res) return;
    var oW = os[3] > os[4] ? os[1] : os[2], oL = os[3] > os[4] ? os[2] : os[1];
    if (m4.id === 'f') playOther(c, 4, m3.opp, oL, 15); else playOther(c, 4, m3.opp, oW, 21);
  }
  /** Clasificación de la liguilla: [{t, pj, w, pf, pa}] por victorias, diferencia y orden. */
  function table(c) {
    var p = c.pro, rows = [0, 1, 2, 3].map(function (t) { return { t: t, pj: 0, w: 0, pf: 0, pa: 0 }; });
    var add = function (a, b, sa, sb) { rows[a].pj++; rows[b].pj++; rows[a].pf += sa; rows[a].pa += sb; rows[b].pf += sb; rows[b].pa += sa; if (sa > sb) rows[a].w++; else rows[b].w++; };
    for (var j = 0; j < 3; j++) { var m = p.m[j]; if (m && m.res) add(0, m.opp, m.res.sc[0] | 0, m.res.sc[1] | 0); }
    p.ot.forEach(function (o) { if (o[0] < 3) add(o[1], o[2], o[3], o[4]); });
    var by = rows.slice(); by.sort(function (x, y) { return y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || x.t - y.t; });
    return by;
  }
  function leagueDone(c) { var p = c.pro; return !!(p.m[2] && p.m[2].res); }
  /** Semifinales (1r-4º y 2º-3r) o null si la liguilla no ha acabado. */
  function semis(c) { if (!leagueDone(c)) return null; var t = table(c); return [[t[0].t, t[3].t], [t[1].t, t[2].t]]; }
  function setSemi(c) { var s = semis(c); if (!s) return; var mine = s[0].indexOf(0) >= 0 ? s[0] : s[1]; c.pro.m[3].opp = mine[0] === 0 ? mine[1] : mine[0]; }
  /** Cuadro del torneo: {semis: [[a, b, sa, sb]|[a, b]], final: [a, b, sa?, sb?] | null, p3: …}. */
  function bracket(c) {
    var p = c.pro, s = semis(c); if (!s) return null;
    var m3 = p.m[3], m4 = p.m[4], os = otOf(c, 3)[0], o4 = otOf(c, 4)[0];
    var out = { semis: [], final: null, p3: null };
    s.forEach(function (pr) {
      if (pr.indexOf(0) >= 0) out.semis.push(m3.res ? [0, m3.opp, m3.res.sc[0], m3.res.sc[1]] : [0, m3.opp]);
      else out.semis.push(os ? [os[1], os[2], os[3], os[4]] : [pr[0], pr[1]]);
    });
    if (m4.id) {
      var mine = m4.res ? [0, m4.opp, m4.res.sc[0], m4.res.sc[1]] : [0, m4.opp], oth = o4 ? [o4[1], o4[2], o4[3], o4[4]] : null;
      if (m4.id === 'f') { out.final = mine; out.p3 = oth; } else { out.p3 = mine; out.final = oth; }
    }
    return out;
  }
  function next(c) { var p = ensure(c); if (!p || p.st !== 'season' || p.i > 4) return null; var m = p.m[p.i]; return m && m.opp >= 0 ? m : null; }

  // ================================================================== partido: montaje, cierre y simulación
  function diffKey(c) { var E = K(c); return E.diffOf ? E.diffOf(c) : 'normal'; }
  function aiOf(c, id) {
    var E = K(c), S = E.STEPS || [{ d: 'easy' }, { d: 'normal', soft: true }, { d: 'normal' }, { d: 'hard' }, { d: 'expert' }];
    var s = clampI((PRO_AI[diffKey(c)] | 0) + (id === 'f' ? 1 : 0), 0, S.length - 1), st = S[s], D = VB.DIFF && VB.DIFF[st.d];
    var nm = (D && D.name) || st.d; return { step: s, diff: st.d, soft: !!st.soft, name: st.soft ? nm + ' suave' : nm };
  }
  function kitOf(s) { return { kitShirt: s.kit[0], kitAccent: s.kit[1], kitShorts: s.kit[2], kitPattern: s.pat || 'liso', kitLibero: s.lib }; }
  function copyO(o) { return JSON.parse(JSON.stringify(o)); }
  function labelOf(c, id) { var x = c.pro.cast; return (id === 'sf' || id === 'f' || id === 'p3' ? x.comp.cup : 'Juvenil') + ': ' + (id === 'f' ? 'Final' : MATCH[id].lbl); }
  function ambOf(c, m) {
    var x = c.pro.cast, me = x.sch[0], op = x.sch[m.opp], tags = ['juvenil'], heat = 0.2;
    if (m.opp === 3) { tags.push('derbi'); heat += 0.2; }
    if (m.id === 'f') { tags.push('final'); heat = 0.5; } else if (m.id === 'sf') { tags.push('semi'); heat += 0.1; }
    return { home: m.id === 'f' || m.id === 'p3' || m.id === 'sf' ? -1 : 0, heat: Math.round(heat * 100) / 100, fans: [0.3, 0.3], tags: tags, level: 'low', city: x.city, venue: x.city,
      short: [me.n, op.n], capt: [0, 0], coach: ['', ''], riv: 0 };
  }
  /** Opciones del partido i (como trialSetup / trialSetup6) o null si no toca. Marca live y guarda. */
  function setup(c, i) {
    var p = ensure(c); if (!p || !active(c) || p.st !== 'season' || i !== p.i || i > 4) return null;
    var m = p.m[i]; if (!m || m.opp < 0 || !m.id) return null;
    var E = K(c), hall = hallC(c), x = p.cast, me = x.sch[0], op = x.sch[m.opp], ovr = E.playerOvr(c), ai = aiOf(c, m.id);
    var bd = VB.Badges && VB.Badges.forPlayer ? VB.Badges.forPlayer(c.player) : null; if (bd && !Object.keys(bd).length) bd = null;
    var ref = copyO((E.REF && E.REF.low) || { p1: 0.55, p2: 0.4, p3: 0.22, d3: 0.25, chal: 0, judges: false }); ref.chal = 0;
    var gs = m.goals.map(function (g) { return g.txt; }).join('; ');
    var r = rngOf(c.seed, 'pro-opp', m.opp), G = E.genSt || E._genSt, L = VB.CareerLife, stMe = copyO(c.player.st), pos = myPos(c);
    var cs = { pro: 1, mode: hall ? 'hall' : 'beach', season: 1, phase: 'pick', week: i, round: 0, label: labelOf(c, m.id), me: me.ab, rival: op.ab,
      venue: hall ? 'hall' : 'beach', meName: me.n, rivalName: op.n, clubName: me.n, player: c.player.name, num: c.player.num, cdiff: diffKey(c),
      goal: gs, sets: 1, points: m.pts, amb: ambOf(c, m), pause: { restart: 'Reiniciar el partido', quit: 'Volver al juvenil', warn: '' } };
    var out = { sets: 1, points: m.pts, difficulty: ai.diff, rookie: ai.soft, diffName: ai.name, cdiff: diffKey(c), ref: ref, kit: kitOf(me), rivalKit: kitOf(op), career: cs };
    var used = {}; used[c.player.num | 0] = 1; used[13] = 1;
    var numFree = function () { var n, g = 0; do { n = 1 + Math.floor(r() * 20); } while (used[n] && g++ < 60); while (used[n]) n++; used[n] = 1; return n; };
    if (!hall) {
      var mate = x.friend, stMate = G(clamp(ovr - 1, 1, 99), mate.pos, rngOf(c.seed, 'pro-mate'));
      var a1, nums1;
      if (m.opp === 3) {
        var rv = x.rival, stR = L && L.bossSt ? L.bossSt(clamp(ovr + 2, 1, 99), rv.style, r) : G(clamp(ovr + 2, 1, 99), rv.pos, r);
        used[rv.num] = 1; a1 = [stR, G(clamp(ovr - 1, 1, 99), rv.pos === 'cr' ? 'atk' : 'cr', r)]; nums1 = [rv.num, numFree()];
        cs.rivalP = rv.n; cs.rivalNum = rv.num; cs.rivalStyle = rv.style;
      } else {
        var d = m.opp === 1 ? 5 : 3; a1 = [G(clamp(ovr - d, 1, 99), 'atk', r), G(clamp(ovr - d, 1, 99), 'cr', r)]; nums1 = [numFree(), numFree()];
      }
      cs.mate = mate.n; cs.mateNum = mate.num; cs.role = pos;
      out.attrs = [[stMe, stMate], a1]; out.badges = bd ? [[bd, null], null] : null; out.venue = E.VENUE || 'beach';
      out.nums = [[c.player.num, mate.num], nums1];
    } else {
      var R = E.simRoles ? E.simRoles() : ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'], idx = R.indexOf(pos); if (idx < 0) idx = 0;
      var mr = rngOf(c.seed, 'pro-team'), a0 = [], n0 = [], nm0 = [], left = x.mates.slice(), fUsed = false;
      R.forEach(function (rp, j) {
        if (j === idx) { a0.push(stMe); n0.push(c.player.num); nm0.push(c.player.name); return; }
        if (!fUsed && rp === x.friend.pos) { fUsed = true; a0.push(G(clamp(ovr - 1, 1, 99), rp, mr)); n0.push(x.friend.num); nm0.push(x.friend.n); return; }
        var k = -1; for (var q = 0; q < left.length; q++) if (left[q].pos === rp) { k = q; break; }
        var mt = k >= 0 ? left.splice(k, 1)[0] : left.shift() || { n: 'Suplente', num: 99 - j, pos: rp };
        a0.push(G(clamp(ovr - 3 + Math.round((mr() - 0.5) * 4), 1, 99), rp, mr)); n0.push(mt.num); nm0.push(mt.n);
      });
      var a1h = [], n1 = [], nm1 = [], off = m.opp === 1 ? 6 : m.opp === 2 ? 4 : 2, H = VB.Career.hall, nmUsed = {};
      nm0.forEach(function (s) { nmUsed[s] = 1; });
      var u1 = {}; u1[13] = 1; if (m.opp === 3) u1[x.rival.num] = 1;
      var num1 = function () { var n, g = 0; do { n = 1 + Math.floor(r() * 20); } while (u1[n] && g++ < 60); while (u1[n]) n++; u1[n] = 1; return n; };
      var rvDone = false;
      R.forEach(function (rp, j) {
        if (m.opp === 3 && !rvDone && rp === x.rival.pos) { rvDone = true; a1h.push(G(clamp(ovr + 1, 1, 99), rp, r)); n1.push(x.rival.num); nm1.push(x.rival.n); return; }
        a1h.push(G(clamp(ovr - off, 1, 99), rp, r)); n1.push(num1());
        var s, g = 0; do { s = H && H._name ? H._name(r) : 'Jugador ' + (j + 1); } while (nmUsed[s] && g++ < 30); nmUsed[s] = 1; nm1.push(s);
      });
      if (m.opp === 3) { cs.rivalP = x.rival.n; cs.rivalNum = x.rival.num; cs.rivalStyle = x.rival.style; }
      var P6 = E.POS || VB.Career.POS6 || {};
      cs.pos = pos; cs.posName = P6[pos] ? P6[pos].name : pos; cs.mate = ''; cs.mateNum = 0; cs.meOn = true; cs.status = 'start';
      out.format = '6v6'; out.venue = 'hall'; out.ctrlRole = pos; out.ctrlIdx = idx; out.meSlot = idx; out.meBench = -1; out.meOn = true;
      out.attrs = [a0, a1h]; out.nums = [n0, n1]; out.names = [nm0, nm1];
      out.badges = bd ? [R.map(function (x0, j) { return j === idx ? bd : null; }), null] : null;
    }
    var sg = null; try { sg = E._sigOf ? E._sigOf(c, hall ? 'hall' : 'beach') : null; } catch (e) { sg = null; }
    if (sg) out.serveSig = sg;
    p.live = 1;
    if (E.abortMatch) E.abortMatch();
    E.save(c);
    return out;
  }

  /** Cierra el partido en curso (p.i) con res = {w, sc, nota, ok, sim}: tabla, cara a cara, cruces, chat; al 5º, el informe. */
  function closeMatch(c, res) {
    var p = c.pro, i = p.i, m = p.m[i];
    m.res = res;
    if (m.opp === 3) { if (res.w) p.h2h[0]++; else p.h2h[1]++; }
    if (i < 3) simOthers(c, i);
    if (i === 2) setSemi(c);
    if (i === 3) {
      simOthers(c, 3);
      var os = otOf(c, 3)[0], oW = os ? (os[3] > os[4] ? os[1] : os[2]) : 1, oL = os ? (os[3] > os[4] ? os[2] : os[1]) : 2, id = res.w ? 'f' : 'p3';
      p.m[4] = { id: id, opp: res.w ? oW : oL, pts: MATCH[id].pts, goals: goalsFor(c, id), res: null };
    }
    if (i === 4) simOthers(c, 4);
    p.i = i + 1; p.live = 0;
    var wl = res.w ? 'w' : 'l';
    if (i === 0 || i === 2) say(c, 'post_' + wl, i);
    else if (i === 1) say(c, 'post_j2_' + wl, i);
    else if (i === 3) say(c, 'post_sf_' + wl, i);
    else say(c, 'post_' + p.m[4].id + '_' + wl, i);
    if (res.sim) say(c, 'sim', i);
    if (p.i === 1) say(c, 'pre_j2', 1);
    else if (p.i === 2) say(c, 'pre_j3', 2);
    else if (p.i === 3) say(c, 'pre_sf', 3);
    else if (p.i === 4) say(c, p.m[4].id === 'f' ? 'pre_f' : 'pre_p3', 4);
    if (p.i >= 5) finish(c);
  }
  /** Cierre con las estadísticas me (ingest; null = nadie te vio) y la nota en directo rt (opcional): objetivos 'stat' con trialGrade
   *  (cada uno suma TRIAL_GOAL a la nota, como en la prueba), luego 'win' y 'nota' (no suman). Guarda. Devuelve lo de la hoja. */
  function doneWith(c, res, me, rt, rallies) {
    var p = ensure(c); if (!p || p.st !== 'season' || p.i > 4) return null;
    var E = K(c), i = p.i, m = p.m[i]; if (!m || !m.id) return null;
    res = res || {}; var sets = res.sets || [res.win ? 1 : 0, res.win ? 0 : 1], ss = res.setScores && res.setScores[0] ? res.setScores : [[res.win ? m.pts : 0, res.win ? 0 : m.pts]];
    var win = res.win != null ? !!res.win : (sets[0] | 0) > (sets[1] | 0), sc = [ss[0][0] | 0, ss[0][1] | 0];
    var seen = !!me, sg = m.goals.filter(function (g) { return g.kind === 'stat'; }), gr = null, nota = null;
    if (seen) {
      var R = rallies || sc[0] + sc[1];
      gr = E.trialGrade ? E.trialGrade(c, me, { sets: [sets[0] | 0, sets[1] | 0], setScores: ss }, R, sg, rt || null) : null;
      nota = gr ? gr.nota : null;
    } else nota = round1(Math.min(6.4, 5.7 + (win ? 0.5 : 0) + 0.6 * rngOf(c.seed, 'pro-look', i)()));
    var gl = m.goals.map(function (g) {
      var ok = null, v = null;
      if (seen) {
        if (g.kind === 'stat') { var x = gr && gr.goals.filter(function (y) { return y.id === g.id && y.n === g.n; })[0]; v = x ? x.v : (me[g.stat] | 0); ok = x ? !!x.ok : (g.op === '<=' ? v <= g.n : v >= g.n); }
        else if (g.kind === 'win') ok = win;
        else if (g.kind === 'nota') ok = nota != null && nota >= g.n - 1e-9;
      }
      return { txt: g.txt, ok: ok, v: v };
    });
    closeMatch(c, { w: win ? 1 : 0, sc: sc, nota: nota, ok: gl.map(function (g) { return g.ok == null ? null : g.ok ? 1 : 0; }), sim: seen ? 0 : 1 });
    E.save(c);
    var out = { i: i, id: m.id, opp: m.opp, win: win, sc: sc, nota: nota, goals: gl, sim: !seen, last: p.i >= 5 };
    if (gr && gr.rt) out.rt = gr.rt;
    return out;
  }
  /** Fin del partido jugado (main.js, careerEvents): res = {sets, setScores, win}; g = la partida. «Mirar» (autopilot) = nadie te ve. */
  function done(c, res, g) {
    var p = ensure(c); if (!p || p.st !== 'season') return null;
    var E = K(c), M = E._M ? E._M() : null, mine = M && g && M.g === g && !g.autopilot;
    var me = mine ? M.p[0] : null, rt = mine ? M.rt : null;
    var ss = (res && res.setScores) || [], rallies = (g && g.rallyN) || (mine && M.rallies) || ss.reduce(function (s, x) { return s + (x[0] | 0) + (x[1] | 0); }, 0);
    var out = doneWith(c, res, me, rt, rallies);
    if (E.abortMatch) E.abortMatch();
    return out;
  }
  /** Partido dejado a medias: sigue pendiente y no castiga (es el juvenil). */
  function quit(c) { var p = ensure(c); if (!p) return; p.live = 0; var E = K(c); if (E.abortMatch) E.abortMatch(); E.save(c); }
  /** «Simular»: el resultado por la fuerza de los dos institutos; nadie te ve (nota ≤ 6,4 y objetivos sin marca). */
  function sim(c) {
    var p = ensure(c); if (!p || p.st !== 'season' || p.i > 4) return null;
    var i = p.i, m = p.m[i]; if (!m || m.opp < 0) return null;
    var r = rngOf(c.seed, 'pro-sim', i, m.id), win = r() < pWin(str(c, 0), str(c, m.opp)), sc = scoreOf(r, m.pts, win);
    var nota = round1(Math.min(6.4, 5.7 + (win ? 0.5 : 0) + 0.6 * r()));
    closeMatch(c, { w: win ? 1 : 0, sc: sc, nota: nota, ok: m.goals.map(function () { return null; }), sim: 1 });
    K(c).save(c);
    return { i: i, id: m.id, win: win, sc: sc, nota: nota, sim: true, last: p.i >= 5 };
  }
  /** Saltar el resto del juvenil: simula lo que falta y llega el informe. */
  function skipRest(c) { var p = ensure(c); if (!p || p.st !== 'season') return false; var g = 0; while (p.st === 'season' && g++ < 6) sim(c); return true; }
  /** «Ir directo a las pruebas» desde la presentación: las ofertas de siempre (las mismas que sin juvenil) y el mensaje del agente. */
  function skip(c) {
    var p = ensure(c); if (!p || p.st !== 'intro') return false;
    c.offers = baseOffers(c);
    var nt = c.offers.filter(function (o) { return !o.trial; }).length, tr = c.offers.length - nt;
    agentMsg(c, 'skip', { n: nt, yp: tr ? ' y una prueba' : '' }, plural(c.offers.length, 'oferta', 'ofertas'));
    p.st = 'skip';
    K(c).save(c);
    return true;
  }

  // ================================================================== informe de los ojeadores y ofertas
  /** Puntuación 0-100: nota media ponderada (40), objetivos cumplidos (25) y victorias (35). */
  function scoreParts(c) {
    var p = c.pro, sw = 0, sn = 0, met = 0, wins = 0, lw = 0, winP = 0;
    p.m.forEach(function (m) {
      if (!m || !m.res) return;
      var w = m.id === 'sf' || m.id === 'f' || m.id === 'p3' ? 1.5 : 1;
      if (typeof m.res.nota === 'number') { sn += m.res.nota * w; sw += w; }
      met += (m.res.ok || []).filter(function (x) { return x === 1 || x === true; }).length;
      // (simulado: nadie lo ha visto, la victoria cuenta la mitad para los ojeadores)
      if (m.res.w) { var f = m.res.sim ? 0.5 : 1; wins++; if (m.id.charAt(0) === 'j') lw += f; if (m.id === 'sf') winP += 8 * f; if (m.id === 'f') winP += 12 * f; if (m.id === 'p3') winP += 4 * f; }
    });
    var avg = sw ? sn / sw : 5;
    winP = Math.min(35, Math.min(15, 5 * lw) + winP);
    var notaP = clamp((avg - NOTA_0 - NOTA_D[hallC(c) ? 'hall' : 'beach']) / 3.5, 0, 1) * 40, goalP = met / 10 * 25;
    return { avg: avg, met: met, wins: wins, notaP: notaP, goalP: goalP, winP: winP, s: clampI(notaP + goalP + winP, 0, 100) };
  }
  function score(c) { return scoreParts(c).s; }
  function tierOf(s) { for (var i = TIER_K.length - 1; i >= 0; i--) if (s >= TIER[TIER_K[i]].min) return TIER_K[i]; return 'nadie'; }
  function baseOffers(c) { return K(c)._startOffers(c, 0); }
  function sortOffers(a) { a.sort(function (x, y) { return (x.trial ? 1 : 0) - (y.trial ? 1 : 0) || y.ovr - x.ovr; }); return a; }
  /** Ofertas según el nivel: base = las de crear sin juvenil; nadie sin la prueba; montón tal cual; el resto, sin la prueba al azar y
   *  con N invitaciones seguras (o.pscout, o.up y algo más de probabilidad, tope 0,8). */
  function offers(c, tier) {
    var E = K(c), T = TIER[tier] || TIER.monton, base = baseOffers(c), hall = hallC(c), s = c.pro && c.pro.score != null ? c.pro.score : 0;
    if (tier === 'monton') return base;
    var out = base.filter(function (o) { return !o.trial; });
    if (!T.n) return sortOffers(out);
    var r = rngOf(c.seed, 'pro-off'), taken = {}, inv = [];
    out.forEach(function (o) { taken[o.club] = 1; });
    var add = function (o, up) { o.chance = Math.round(Math.min(CHANCE_MAX, (o.chance || 0.3) + T.bonus) * 100) / 100; o.up = up; o.pscout = { tier: tier, s: s }; inv.push(o); taken[o.club] = 1; };
    if (!hall) {
      var nat = E.clubsOf(c, 1).slice().sort(function (a, b) { return a.q - b.q || a.id - b.id; }).filter(function (k) { return !taken[k.id]; });
      nat.slice(0, Math.min(2, T.n)).forEach(function (k) { add(E._startOffer(c, k, 1, 0, r, true), 1); });
      if (T.n >= 3) { var hip = E.clubsOf(c, 2).slice().sort(function (a, b) { return a.q - b.q || a.id - b.id; })[0]; if (hip) add(E._startOffer(c, hip, 2, 0, r, true), 2); }
    } else {
      var low = lowLid(c), two = low !== c.cc + '1', div = E.leagueClubs(c, low).slice().sort(function (a, b) { return a.ovr - b.ovr || a.id - b.id; });
      var pool = div.slice(0, 6), avg = pool.reduce(function (t, k) { return t + k.ovr; }, 0) / Math.max(1, pool.length);
      var cand = (two ? E.leagueClubs(c, c.cc + '1') : div).slice().sort(function (a, b) { return a.ovr - b.ovr || a.id - b.id; });
      var top = T.n >= 3 ? Math.floor(cand.length * 3 / 4) : Math.floor(cand.length / 2);   // (Joya: la 3ª, en un club de arriba)
      var want = two ? [0, 1, top] : [3, 4, top], got = [];
      want.slice(0, T.n).forEach(function (w) {
        var j = Math.min(w, cand.length - 1), g = 0;
        while (j >= 0 && j < cand.length && (taken[cand[j].id] || got.indexOf(cand[j].id) >= 0) && g++ < cand.length) j = (j + 1) % cand.length;
        if (j < 0 || j >= cand.length || taken[cand[j].id] || got.indexOf(cand[j].id) >= 0) return;
        got.push(cand[j].id); add(E._startOffer(c, cand[j], avg, 0, r, true), two ? 1 : 0);
      });
    }
    return sortOffers(out.concat(inv));
  }
  function ligaOf(c, o) {
    var E = K(c);
    if (hallC(c)) { var L = E.league ? E.league(o.lid, c) : null; return L ? 'la ' + L.name : 'la liga'; }
    var L2 = E.league ? E.league(o.lvl) : null; return L2 ? (E.lname ? E.lname(L2) : L2.name) : 'el circuito';
  }
  function agentMsg(c, kind, v, title) {
    var who = story() ? 'Soy Cris Montoya, tu agente desde hoy. ' : 'Soy tu agente. ';
    var tx = AGENT_TX[kind].replace(/\{(\w+)\}/g, function (a, k) { return v[k] != null ? v[k] : ''; });
    K(c)._msg(c, 'agent', 'Tienes ' + title, who + tx);
  }
  /** El informe: puntuación, nivel, ofertas, rival a la Carrera, personalidad, seguidores y mensajes (entrenador y, el último, el agente). */
  function finish(c) {
    var p = c.pro; if (!p || p.st === 'scout' || p.st === 'done') return;
    var sp = scoreParts(c), t = tierOf(sp.s), x = p.cast, E = K(c);
    p.score = sp.s; p.tier = t;
    c.offers = offers(c, t);
    kidToLife(c);
    applyPers(c);
    var L = VB.CareerLife;
    if (TIER[t].fame && L && L.addFame) { try { L.addFame(c, TIER[t].fame, 'juvenil'); } catch (e) { } }
    say(c, 'end', 5);
    var nm = p.m.filter(function (m) { return m.res; }).length;
    E._msg(c, 'pro', 'Fin del juvenil', x.coach.n + ': «' + text(c, { b: 'end_coach', i: 5 }) + '»' + (x.coach.p === 'datos' ? '' : ' ' + nm + ' partidos, ' + plural(sp.wins, 'victoria', 'victorias') + ' y nota media ' + fmt1(sp.avg) + '.'));
    var inv = c.offers.filter(function (o) { return obj(o.pscout); }), nt = c.offers.filter(function (o) { return !o.trial; }).length, tr = c.offers.length - nt;
    var top = inv.slice().sort(function (a, b) { return (b.up | 0) - (a.up | 0) || b.ovr - a.ovr; })[0];
    agentMsg(c, t === 'joya' && hallC(c) ? 'joya6' : t, { n: nt, t: inv.length, cup: x.comp.cup, liga: top ? ligaOf(c, top) : '', yp: tr ? ' y una prueba' : '' }, plural(c.offers.length, 'oferta', 'ofertas'));
    p.st = 'scout';
  }
  /** Tu rival de la infancia pasa a ser el rival de la Carrera (career-life), con el cara a cara del juvenil y sin club hasta el tuyo. */
  function kidToLife(c) {
    var L = VB.CareerLife; if (!L || !L.ensure) return;
    var p = c.pro, rv = p.cast.rival, l = L.ensure(c);
    l.rival = { name: rv.n, num: rv.num, club: -1, off: p.h2h[0] > p.h2h[1] ? 1 : p.h2h[0] < p.h2h[1] ? 3 : 2, w: p.h2h[0], l: p.h2h[1], since: 1, kid: 1, style: rv.style };
  }
  function applyPers(c) {
    var p = c.pro; if (!p || p.perk || !p.pers) return;
    p.perk = 1;
    if (p.pers === 'work') { if (!obj(c.tp)) c.tp = { phys: 0, def: 0, atk: 0 }; ['phys', 'def', 'atk'].forEach(function (k) { c.tp[k] = Math.min(99, (c.tp[k] | 0) + 25); }); }
    else if (p.pers === 'show') { var L = VB.CareerLife; if (L && L.addFame) { try { L.addFame(c, 150, 'artista'); } catch (e) { } } }
  }
  /** Gancho 'join' (career.js joinClub/joinClub6): «Líder» suma química en el primer club; el rival del juvenil ficha por un club de tu
   *  liga (y, si cambias de liga, te persigue con FOLLOW; career-life añade su 0,5 de siempre después). */
  function onJoin(c) {
    var p = c && obj(c.pro) ? c.pro : null; if (!p) return;
    if (p.pers === 'lead' && p.perk && !p.lead) {
      if (hallC(c)) c.chem = clamp((c.chem | 0) + 10, 0, 100); else if (c.mate) c.mate.chem = clamp((c.mate.chem | 0) + 10, 0, 100);
      p.lead = 1;
    }
    var l = c.life, rv = l && l.rival; if (!obj(rv) || !rv.kid) return;
    var E = K(c), me = c.myClub >= 0 && E.myClub(c); if (!me) return;
    var hall = hallC(c), same = function (k) { return hall ? k.lid === me.lid : k.lvl === me.lvl; };
    var rk = rv.club >= 0 ? E.club(c, rv.club) : null;
    if (rk && same(rk) && rk.id !== me.id) return;
    var pool = ((hall ? E.leagueClubs(c, me.lid) : E.clubsOf(c, me.lvl)) || []).filter(function (k) { return k.id !== me.id; }).sort(byId);
    if (!pool.length) return;
    if (!rk) {
      var k = pool[Math.floor(rngOf(c.seed, 'pro-rivalkid', me.id)() * pool.length) % pool.length];
      rv.club = k.id; rv.since = c.season;
      E._msg(c, 'fans', rv.name + ' vuelve', rv.name + ', tu rival del juvenil, ha fichado por ' + k.name + '. Otra vez en la misma liga. El cara a cara sigue: ' + (rv.w | 0) + '-' + (rv.l | 0) + '.');
      return;
    }
    var r = rngOf(c.seed, 'pro-follow', c.season, me.id);
    if (r() < FOLLOW) {
      var k2 = pool[Math.floor(r() * pool.length) % pool.length]; rv.club = k2.id;
      E._msg(c, 'fans', rv.name + ' te sigue', 'Tu rival del juvenil, ' + rv.name + ', ha fichado por ' + k2.name + '. No hay manera de quitárselo de encima. El cara a cara sigue: ' + (rv.w | 0) + '-' + (rv.l | 0) + '.');
    }
  }
  /** El rival del juvenil (para otras funciones, p. ej. la selección), o null. */
  function kidRival(c) { var p = ensure(c); if (!p) return null; var rv = p.cast.rival; return { name: rv.n, num: rv.num, style: rv.style, pos: rv.pos, w: p.h2h[0], l: p.h2h[1] }; }
  function setPers(c, k) { var p = ensure(c); if (!p || p.st !== 'intro' || !PERS[k]) return false; p.pers = k; K(c).save(c); return true; }
  /** Página de la presentación: d = +1 / −1. Al pasar de la 3ª empieza la temporada. Devuelve el estado. */
  function page(c, d) {
    var p = ensure(c); if (!p || p.st !== 'intro') return '';
    if (d > 0 && p.pg === 0 && !p.pers) return 'pers';
    if (d > 0 && p.pg >= 2) { p.st = 'season'; say(c, 'season', 0); K(c).save(c); return 'season'; }
    p.pg = clampI(p.pg + (d > 0 ? 1 : -1), 0, 2); K(c).save(c); return 'intro';
  }
  function hero(c) {
    var p = ensure(c); if (!p) return null;
    var x = p.cast;   // (career-ui añade «, carrera de playa/pista» al aria)
    if (p.st === 'intro') return { title: 'Juvenil', chip: 'Presentación', line: x.sch[0].n, aria: 'Juvenil: presentación' };
    if (p.st === 'scout') return { title: 'Juvenil', chip: 'Informe', line: 'Informe de los ojeadores', aria: 'Juvenil: informe de los ojeadores' };
    var m = p.m[Math.min(4, p.i)], op = m && m.opp >= 0 ? x.sch[m.opp] : null;
    return { title: 'Juvenil', chip: 'J' + (p.i + 1) + ' de 5', line: op ? x.sch[0].ab + ' contra ' + op.ab : x.sch[0].n, aria: 'Juvenil: jornada ' + (p.i + 1) + ' de 5' };
  }

  // ================================================================== chat
  function vars(c, i) {
    var p = c.pro, x = p.cast, m = p.m[Math.min(4, Math.max(0, i | 0))] || p.m[0], sp = scoreParts(c);
    return { yo: first(c.player && c.player.name), amigo: first(x.friend.n), rival: first(x.rival.n), coach: x.coach.n, school: x.sch[0].n, rschool: x.sch[3].n,
      opp: m && m.opp >= 0 ? x.sch[m.opp].n : x.sch[1].n, cup: x.comp.cup, lg: x.comp.lg, ciudad: x.city, sitio: hallC(c) ? 'el pabellón' : 'la playa',
      nota: fmt1(sp.avg), n: String(p.m.filter(function (y) { return y.res; }).length), w: String(sp.wins) };
  }
  function variants(c, b) {
    var T = CH[b]; if (!T) return [];
    if (T.xc) return T.xc[c.pro.cast.coach.p] || T.xc.sarg;
    if (T.xp) return T.xp[c.pro.pers] || [];
    return T.x || [];
  }
  /** Texto de una entrada del chat (no se guarda: se calcula con la plantilla y la semilla). */
  function text(c, e) {
    var vs = variants(c, e.b); if (!vs.length) return '';
    var v = vs[(B()._hash(c.seed, 'pro-v', e.b, e.i | 0) >>> 0) % vs.length], V = vars(c, e.i);
    return v.replace(/\{(\w+)\}/g, function (a, k) { return V[k] != null ? V[k] : ''; });
  }
  function say(c, moment, i) {
    var p = c.pro, l = MOMENTS[moment] || (moment === 'sim' ? ['sim_coach'] : []);
    l.forEach(function (b) {
      var T = CH[b]; if (!T) return;
      if (T.world && !VB.CareerWorld) return;
      if (T.xp && !T.xp[p.pers]) return;
      p.chat.push({ b: b, i: i | 0, r: 0 });
    });
    if (p.chat.length > CHAT_MAX) p.chat = p.chat.slice(-CHAT_MAX);
  }
  function unreadChat(c) { var p = c && c.pro; return p && Array.isArray(p.chat) ? p.chat.filter(function (x) { return !x.r; }).length : 0; }
  function senderName(c, k) { var x = c.pro.cast; return k === 'coach' ? x.coach.n : k === 'friend' ? x.friend.n : k === 'rival' ? x.rival.n : k === 'fam' ? 'Familia' : k === 'agent' ? (story() ? 'Cris Montoya' : 'Tu agente') : 'Grupo'; }

  // ================================================================== interfaz (cadenas HTML; career-ui pone cabecera y pestañas)
  var Q = ':root:not(#_):not(#_):not(#_) #career', PQ = Q.replace(':root', ':root.ph'), PS = Q.replace(':root', ':root.ph.ph-s');
  var EQ = ':root:not(#_):not(#_):not(#_) #end', PEQ = EQ.replace(':root', ':root.ph');
  function CSS() {
    return [
      '/* prólogo juvenil (js/career-prologue.js) */',
      Q + ' .pro-panel{position:relative;background:var(--sp-cream,#fff4dc);color:var(--sp-ink,#15102a);border-radius:6px;box-shadow:0 0 0 3px var(--sp-ink,#15102a),5px 6px 0 var(--sp-ink,#15102a);padding:24px 16px 14px;margin:16px 8px 16px;transform:rotate(-.8deg)}',
      Q + ' .pro-panel.p2{transform:rotate(.7deg)}' + Q + ' .pro-panel.p3{transform:rotate(-.5deg)}',
      Q + ' .pro-panel p{color:var(--sp-ink,#15102a);font:500 14px/1.4 var(--sp-ui,sans-serif);margin:4px 0}',
      Q + ' .pro-pt{position:absolute;left:12px;top:-15px;padding:3px 12px;background:var(--sp-gold,#ffcb3d);color:var(--sp-ink,#15102a);font:400 17px/1.25 var(--sp-pop,sans-serif);border-radius:4px;box-shadow:0 0 0 3px var(--sp-ink,#15102a);transform:rotate(-3deg)}',
      Q + ' .pro-who{display:flex;align-items:center;gap:12px;margin:2px 0 8px}',
      Q + ' .pro-who b{display:block;font:400 22px/1.1 var(--sp-pop,sans-serif);color:var(--sp-ink,#15102a)}',
      Q + ' .pro-who small{display:block;font:600 14px/1.3 var(--sp-ui,sans-serif);color:var(--sp-ink2,#2f2560)}',
      Q + ' .pro-av{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--av,#3a86ff);color:#fff;font:400 17px/1 var(--sp-pop,sans-serif);box-shadow:0 0 0 2px var(--sp-ink,#15102a)}',
      Q + ' .pro-av.big{width:48px;height:48px;font-size:22px}',
      Q + ' .pro-lbl{display:block;margin:10px 0 6px;font:400 15px var(--sp-pop,sans-serif);color:var(--sp-ink,#15102a)}',
      Q + ' .pro-panel .roles button{background:var(--sp-ink,#15102a);color:var(--sp-cream,#fff4dc);min-height:64px}',
      Q + ' .pro-panel .roles button[aria-pressed="true"]{background:var(--sp-gold,#ffcb3d);color:var(--sp-ink,#15102a)}',
      Q + ' .pro-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
      Q + ' .pro-card{display:flex;gap:10px;align-items:flex-start}',
      Q + ' .pro-card>div{min-width:0}',
      Q + ' .pro-tag{display:inline-block;margin:2px 0 4px;padding:2px 8px;border-radius:999px;background:var(--sp-ink,#15102a);color:var(--sp-gold,#ffcb3d);font:700 12px/1.3 var(--sp-ui,sans-serif)}',
      Q + ' .pro-gift{margin:8px 0 0;font:700 14px/1.35 var(--sp-ui,sans-serif);color:var(--sp-ink2,#2f2560)}',
      Q + ' .pro-note{min-height:1.3em;margin:6px 0 0;font:700 14px var(--sp-ui,sans-serif);color:#c2185b}',
      Q + ' .card .pro-note{color:var(--sp-gold,#ffcb3d)}',
      Q + ' .pro-go h3{margin-bottom:6px}',
      Q + ' .pro-vs{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 8px}',
      Q + ' .pro-vs b{font:400 18px/1.15 var(--sp-pop,sans-serif);color:#fff}',
      Q + ' .pro-vs i{font-style:normal;font:400 15px var(--sp-pop,sans-serif);color:var(--sp-gold,#ffcb3d)}',
      Q + ' .pro-pills{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}',
      Q + ' .pro-pill{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:3px 11px;border-radius:999px;background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 2px var(--sp-gold,#ffcb3d);font:700 13px/1.25 var(--sp-ui,sans-serif);color:#fff}',
      Q + ' .pro-pill.ok{box-shadow:inset 0 0 0 2px #4be0a0}' + Q + ' .pro-pill.no{box-shadow:inset 0 0 0 2px #ff7a8a}' + Q + ' .pro-pill.na{box-shadow:inset 0 0 0 2px rgba(255,255,255,.3);opacity:.85}',
      Q + ' .pro-pill i{font-style:normal;font-weight:900}',
      Q + ' .pro-say{display:flex;gap:10px;align-items:flex-start;margin:8px 0 2px}',
      Q + ' .pro-say p{margin:0;padding:7px 11px;border-radius:4px 14px 14px 14px;background:rgba(255,244,220,.12);font:500 14px/1.35 var(--sp-ui,sans-serif);color:var(--fg2,#eee)}',
      Q + ' .pro-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:0 14px;align-items:start}',
      '@media (max-width:760px){' + Q + ' .pro-cols{grid-template-columns:minmax(0,1fr)}}',
      Q + ' .pro-rows{display:grid;gap:6px}',
      Q + ' .pro-row{display:grid;grid-template-columns:minmax(3.6em,auto) minmax(0,1fr) auto;gap:10px;align-items:center;min-height:44px;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.18);font:600 14px var(--sp-ui,sans-serif);color:#fff}',
      Q + ' .pro-row b{font:400 14px var(--sp-pop,sans-serif);color:var(--sp-gold,#ffcb3d)}',
      Q + ' .pro-row .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      Q + ' .pro-row.next{box-shadow:inset 0 0 0 2px var(--sp-gold,#ffcb3d)}',
      Q + ' .pro-row .w{color:#4be0a0}' + Q + ' .pro-row .l{color:#ff7a8a}',
      Q + ' .pro-tbl th{font-size:12px}' + Q + ' .pro-tbl th abbr{text-decoration:none}',
      Q + ' .pro-go>.acts{flex-wrap:wrap}' + Q + ' .pro-go>.acts>button.pri{flex:1 0 300px}' + Q + ' .pro-go>.acts>button:not(.pri){flex:1 1 170px}',
      Q + ' .pro-go>.acts small{font-size:12px}',
      Q + ' .pro-tbl td,' + Q + ' .pro-tbl th{padding:6px 6px}' + Q + ' .pro-tbl tr.me td{background:rgba(255,128,64,.22)}',
      Q + ' .pro-msgs{display:grid;gap:10px}',
      Q + ' .pro-msg{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;align-items:start}',
      Q + ' .pro-msg>div{padding:7px 12px 9px;border-radius:4px 16px 16px 16px;background:rgba(255,244,220,.1);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.12)}',
      Q + ' .pro-msg.un>div{box-shadow:inset 0 0 0 2px var(--sp-gold,#ffcb3d)}',
      Q + ' .pro-msg small{display:block;font:700 13px/1.2 var(--sp-ui,sans-serif);color:var(--av,#fff);filter:brightness(1.35)}',
      Q + ' .pro-msg p{margin:3px 0 0;font:500 14px/1.4 var(--sp-ui,sans-serif);color:#fff}',
      Q + ' .pro-stamp{display:inline-grid;place-items:center;width:112px;height:112px;margin:4px 12px 8px 4px;float:right;border-radius:50%;background:var(--sp-gold,#ffcb3d);color:var(--sp-ink,#15102a);box-shadow:0 0 0 3px var(--sp-ink,#15102a),3px 4px 0 3px var(--sp-ink,#15102a);transform:rotate(-8deg);text-align:center}',
      Q + ' .pro-stamp b{display:block;font:400 30px/1 var(--sp-pop,sans-serif)}' + Q + ' .pro-stamp small{display:block;padding:0 8px;font:700 13px/1.15 var(--sp-ui,sans-serif)}',
      Q + ' .pro-stamp.t-nadie,' + Q + ' .pro-stamp.t-monton{background:var(--sp-cream,#fff4dc)}' + Q + ' .pro-stamp.t-joya{background:#7bf1d6}',
      Q + ' .pro-inv{clear:both}',
      Q + ' .pro-skip p{margin:0 0 8px}',
      Q + ' .pro-intro{max-width:880px}',
      // PC: la barra de la presentación y del informe sin tarjeta, a la derecha (el parche no se encoge)
      Q + ' .card.x-go.pro-bar{background:none;box-shadow:none;padding:0;margin:4px 8px 12px}',
      Q + ' .card.x-go.pro-bar>.acts{justify-content:flex-end;flex-wrap:wrap-reverse}',
      Q + ' .card.x-go.pro-bar>.acts>button{flex:0 0 auto}',
      // móvil (html.ph): letra con los tokens, nada por debajo de 12 px, filas de 48 y el panel sin desplazamiento lateral
      PQ + ' .pro-panel{margin:var(--ph-s4,16px) var(--ph-s2,8px) var(--ph-s3,12px);padding:var(--ph-s4,16px) var(--ph-s3,12px) var(--ph-s3,12px);transform:rotate(-1.4deg)}',
      PQ + ' .pro-panel.p2{transform:rotate(1.4deg)}' + PQ + ' .pro-panel.p3{transform:rotate(-1deg)}',
      PQ + ' .pro-panel p,' + PQ + ' .pro-say p,' + PQ + ' .pro-msg p{font-size:var(--ph-body,15px)}',
      PQ + ' .pro-pt{font-size:var(--ph-label,14px)}',
      PQ + ' .pro-who b,' + PQ + ' .pro-vs b{font-size:var(--ph-head,20px)}',
      PQ + ' .pro-who small,' + PQ + ' .pro-msg small,' + PQ + ' .pro-tag{font-size:var(--ph-label,14px)}',
      PQ + ' .pro-lbl{font-size:var(--ph-row,16px)}',
      PQ + ' .pro-pill{font-size:var(--ph-label,14px);min-height:32px}',
      PQ + ' .pro-two{grid-template-columns:minmax(0,1fr)}',
      PQ + ' .pro-cols{grid-template-columns:minmax(0,1fr)}',
      PQ + ' .pro-row{min-height:48px;font-size:var(--ph-row,16px)}',
      PQ + ' .pro-row b{font-size:var(--ph-row,16px)}',
      PQ + ' .pro-note,' + PQ + ' .pro-gift{font-size:var(--ph-label,14px)}',
      PQ + ' .pro-note:empty{min-height:0;margin:0}',
      PQ + ' .pro-stamp{width:96px;height:96px}' + PQ + ' .pro-stamp b{font-size:var(--ph-num,22px)}' + PQ + ' .pro-stamp small{font-size:var(--ph-cap,12px)}',
      PQ + ' .pro-panel .roles.pro-pers{grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--ph-hit-gap,10px)}',
      PQ + ' .pro-panel .roles.pro-pers button{min-height:56px;padding:6px 10px}',
      PQ + ' .pro-panel .roles.pro-pers button small{margin-top:2px;font-size:var(--ph-cap,12px);line-height:1.2}',
      PQ + ' .pro-who{margin-bottom:4px}' + PQ + ' .pro-lbl{margin-top:6px}',
      PQ + ' .card.x-go.pro-bar:empty{display:none}',
      // móvil bajo (≤ 345 de alto): la presentación sin adornos para que las tres formas de ser quepan sobre la barra (la letra no baja)
      PS + ' .pro-panel{margin-top:var(--ph-s3,12px);padding-top:var(--ph-s3,12px)}' + PS + ' .pro-who .pro-av{width:36px;height:36px;font-size:17px}' + PS + ' .pro-lbl{margin-top:2px}',
      // ==== movil-aire, paquete carrera-flujo (24-nov-2026; notes/movil-aire.md §5.5). Solo html.ph; PC igual.
      // presentación: tu ficha en una línea (avatar 36), el premio como chip en la pregunta, formas de ser con 10 de hueco y 2 líneas
      PQ + ' .pro-panel.p1 .pro-who{gap:10px;margin:0 0 6px}',
      PQ + ' .pro-panel.p1 .pro-who .pro-av{width:36px;height:36px;font-size:17px}',
      PQ + ' .pro-panel.p1 .pro-who>div{display:flex;align-items:baseline;gap:2px 10px;min-width:0;flex-wrap:wrap}',
      PQ + ' .pro-panel.p1 .pro-who>div>b{flex:none;font-size:var(--ph-row,16px)}',
      PQ + ' .pro-panel.p1 .pro-who>div>small{min-width:0;white-space:normal;overflow:visible;text-overflow:clip;font-size:var(--ph-cap,13px)}',
      // (ronda final) el instituto vuelve en el apaisado, en su propia línea bajo nombre y datos (antes se escondía)
      PQ + ' .pro-panel.p1 .pro-who>div>small+small{display:block;flex:1 0 100%}',
      PQ + ' .pro-lbl{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;margin:4px 0 8px}',
      PQ + ' .pro-gchip{display:inline-block;padding:2px 9px;border-radius:7px 10px 8px 11px;background:var(--sp-ink,#15102a);color:var(--sp-gold,#ffcb3d);font:700 var(--ph-cap,13px)/1.3 var(--sp-ui,sans-serif);letter-spacing:0}',
      PQ + ' .pro-panel .roles.pro-pers{gap:10px}',
      PQ + ' .pro-panel .roles.pro-pers button{min-height:52px;padding:6px 10px}',
      PQ + ' .pro-panel .roles.pro-pers button small{font-size:var(--ph-cap,13px);line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
      // «Ir directo a las pruebas» (1ª página) como botón fantasma pequeño arriba a la derecha (lo sube career-ui phFlow a la cabecera)
      PQ + ' .cr-head>.pro-skiph{grid-area:sb;justify-self:end;align-self:center;position:relative;min-height:44px;height:44px;margin:0;padding:0 14px;border:0;border-radius:12px 15px 11px 16px/14px 11px 16px 12px;background:rgba(21,16,42,.72);color:var(--sp-cream,#fff4dc);box-shadow:inset 0 0 0 2px rgba(255,244,220,.55);font:700 var(--ph-cap,13px)/1.1 var(--sp-ui,sans-serif);letter-spacing:.01em;text-transform:none;white-space:nowrap;cursor:pointer}',
      PQ + ' .cr-head>.pro-skiph.armed{background:var(--sp-danger,#e4572e);box-shadow:0 0 0 2px var(--sp-ink,#15102a)}',
      PQ + ' .cr-head>.pro-skiph:is(.kf,:focus-visible){outline:none;box-shadow:inset 0 0 0 2px var(--sp-gold,#ffcb3d),0 0 0 3px var(--sp-gold,#ffcb3d)}',
      PQ + ' .cr-head:has(>.pro-skiph)>.cr-title{padding-right:calc(var(--pk-sw,190px) + 12px)}',
      // temporada: jornada en tres filas («J3 A vs B» con escudos de 28 / «1 set a 15 | IA Fácil» / objetivos de 32); entrenador en 1 línea
      PQ + ' .card.pro-go{padding:10px 12px}',
      PQ + ' .card.pro-go>h3:first-child{display:none}',
      PQ + ' .pro-go .pro-vs{flex-wrap:nowrap;gap:8px;margin:0 0 4px;min-width:0}',
      PQ + ' .pro-go .pro-vs .pro-j{flex:none;padding:2px 8px;border-radius:7px 10px 8px 11px;background:var(--sp-gold,#ffcb3d);color:var(--sp-ink,#15102a);font:400 var(--ph-label,14px)/1.2 var(--sp-pop,sans-serif);font-style:normal}',
      PQ + ' .pro-go .pro-vs .cr-kit{flex:none;width:28px;height:28px}',
      PQ + ' .pro-go .pro-vs b{min-width:0;font-size:var(--ph-row,16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .pro-go .pro-vs i{flex:none}',
      PQ + ' .pro-go>p.muted{margin:0 0 6px;font-size:var(--ph-cap,13px)}',
      PQ + ' .pro-go .pro-pills{margin:0 0 6px;gap:8px}',
      PQ + ' .pro-go .pro-pill{min-height:32px;padding:2px 10px;font-size:var(--ph-cap,13px)}',
      PQ + ' .pro-go .pro-say{margin:0;align-items:center;gap:8px}',
      PQ + ' .pro-go .pro-say .pro-av{width:28px;height:28px;font-size:14px}',
      PQ + ' .pro-go .pro-say p{padding:5px 10px;font-size:var(--ph-cap,13px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .pro-go .pro-note:empty{display:none}',
      PQ + ' .cr-dock>.sp-btn[data-act="pro-sim"] :is(.sp-s,small){display:none}',
      // tus partidos / invitaciones: encabezado en línea de 12 (sin el sello) para que asomen bajo la jornada
      PQ + ' .card.pro-ih{padding:8px 12px 10px}',
      PQ + ' .card.pro-ih>h3:first-child{margin:0 0 4px;padding:0;background:none;box-shadow:none;border:0;transform:none;font:800 var(--ph-micro,12px)/1.3 var(--sp-ui,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--sp-gold,#ffcb3d);text-shadow:none}',
      PQ + ' .card.pro-ih>h3:first-child::before,' + PQ + ' .card.pro-ih>h3:first-child::after{display:none}',
      PQ + ' .pro-cols>div>.card{margin-bottom:10px}',
      PQ + ' .cr-head>.cr-q.pro-hq{grid-area:sb;justify-self:end;align-self:center;position:relative;top:auto;right:auto;transform:none;margin:0}',
      PQ + ' .cr-head:has(>.pro-hq)>.cr-title{padding-right:56px}',
      PQ + ' .pro-cols .card:has(.pro-rows){padding:10px 12px}',
      PQ + ' .pro-cols .pro-rows{gap:4px}',
      PQ + ' .pro-cols .pro-row{min-height:40px;padding:4px 10px;font-size:var(--ph-label,14px)}',
      PQ + ' .pro-cols .pro-row b{font-size:var(--ph-label,14px)}',
      // equipo: una lista (secciones de 12 px; filas de 56 con la bio al tocar); a .ph-w, dos columnas
      PQ + ' .card.pro-tl{padding:8px 12px 10px}',
      PQ + ' .pro-tg{display:grid;grid-template-columns:minmax(0,1fr);gap:4px 16px}',
      ':root.ph.ph-w:not(#_):not(#_):not(#_) #career .pro-tg{grid-template-columns:repeat(2,minmax(0,1fr))}',
      PQ + ' .pro-sec{display:block;margin:6px 0 2px;font:800 var(--ph-micro,12px)/1.3 var(--sp-ui,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--sp-gold,#ffcb3d)}',
      PQ + ' .pro-acc>summary{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 4px;list-style:none;cursor:pointer;border-radius:10px}',
      PQ + ' .pro-acc>summary::-webkit-details-marker{display:none}',
      PQ + ' .pro-acc>summary:is(:focus-visible,.kf){outline:none;box-shadow:inset 0 0 0 2px var(--sp-gold,#ffcb3d)}',
      PQ + ' .pro-acc .pro-av{width:36px;height:36px;font-size:17px}',
      PQ + ' .pro-an{display:flex;flex-direction:column;min-width:0;flex:1 1 auto}',
      PQ + ' .pro-an b{font:400 var(--ph-row,16px)/1.15 var(--sp-pop,sans-serif);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .pro-an small{font:600 var(--ph-cap,13px)/1.3 var(--sp-ui,sans-serif);color:rgba(255,244,220,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .pro-ar{flex:none;font:400 var(--ph-row,16px) var(--sp-pop,sans-serif);color:var(--sp-gold,#ffcb3d)}',
      PQ + ' .pro-chev{flex:none;font-style:normal;color:rgba(255,244,220,.7);transition:transform .15s}',
      PQ + ' .pro-acc[open] .pro-chev{transform:rotate(180deg)}',
      PQ + ' .pro-acc>p{margin:0 4px 8px 50px;font-size:var(--ph-cap,13px)}',
      PQ + ' .pro-mates{gap:2px}',
      PQ + ' .pro-mates .pro-row{min-height:44px;padding:4px 8px;font-size:var(--ph-label,14px);background:none;border-bottom:1px solid rgba(255,244,220,.1);border-radius:0}',
      PQ + ' .pro-mates .pro-row b{font-size:var(--ph-label,14px)}',
      // chat: avatar 28, nombre en la línea del mensaje, burbuja sin borde; seguidos del mismo, sin avatar ni nombre
      PQ + ' .pro-msgs:has(>.pm-ph){gap:6px}',
      PQ + ' .pro-msg.pm-ph{grid-template-columns:28px minmax(0,1fr);gap:8px}',
      PQ + ' .pro-msg.pm-ph .pro-av{width:28px;height:28px;font-size:14px}',
      PQ + ' .pro-msg.pm-ph.cont{margin-top:-2px}',
      PQ + ' .pro-msg.pm-ph>div{padding:8px 10px;box-shadow:none;border-radius:4px 14px 14px 14px}',
      PQ + ' .pro-msg.pm-ph.cont>div{border-radius:14px}',
      PQ + ' .pro-msg.pm-ph.un>div{box-shadow:inset 3px 0 0 var(--sp-gold,#ffcb3d)}',
      PQ + ' .pro-msg.pm-ph p{margin:0;font-size:var(--ph-body,15px);line-height:1.35}',
      PQ + ' .pro-msg.pm-ph .pm-n{color:var(--av,#fff);filter:brightness(1.35);font-weight:800}',
      // informe: cifras y el círculo de 52 en una banda de 56; la frase en una línea; las invitaciones en filas de 44
      PQ + ' .pro-band{display:flex;align-items:center;gap:12px;min-height:56px}',
      PQ + ' .pro-band .pro-stamp{float:none;flex:none;width:52px;height:52px;margin:0;box-shadow:0 0 0 2.5px var(--sp-ink,#15102a),2px 3px 0 2.5px var(--sp-ink,#15102a)}',
      PQ + ' .pro-band .pro-stamp b{font-size:18px}',
      PQ + ' .pro-band .pro-stamp small{display:none}',   // (el nivel ya lo dice la frase de debajo y la etiqueta del círculo)
      PQ + ' .pro-band .sp-heros{flex:1 1 auto;min-width:0;margin:0}',
      PQ + ' .pro-band .sp-heros>*{padding:3px 6px}',
      PQ + ' .pro-band .sp-heros .sp-hn{font-size:var(--ph-row,16px)}',
      PQ + ' .pro-band .sp-heros .sp-hl{font-size:var(--ph-micro,12px)}',
      PQ + ' .card.pro-sc{padding:10px 12px}',
      PQ + ' .card.pro-sc .pro-inv{margin:6px 0 0;font-size:var(--ph-cap,13px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .card.pro-iv{padding:10px 12px}',
      PQ + ' .card.pro-iv .pro-rows{gap:4px}',
      PQ + ' .card.pro-iv .pro-row{min-height:44px;padding:4px 10px;font-size:var(--ph-label,14px)}',
      PQ + ' .card.pro-iv .pro-row b{font-size:var(--ph-label,14px)}',
      PQ + ' .card.pro-iv .pro-ivn{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .card.pro-iv>p.muted{margin:6px 0 0;font-size:var(--ph-cap,13px)}',
      PS + ' .card.pro-sc h3,' + PS + ' .card.pro-iv h3{margin-bottom:4px}',
      // hoja final del partido (main.js careerExtSheet → #endExt)
      EQ + ' .pro-end{display:flex;align-items:center;gap:14px;width:100%;text-align:left}',
      EQ + ' .pro-en{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:84px;height:66px;padding:0 8px;box-sizing:border-box;border-radius:14px;background:var(--rc,#d9a520);color:#fff;box-shadow:0 0 0 2.5px var(--tk,#1d1530),3px 4px 0 var(--tk,#1d1530)}',
      EQ + ' .pro-en b{font:900 30px/1 var(--display,sans-serif);text-shadow:2px 2px 0 var(--tk,#1d1530)}' + EQ + ' .pro-en small{font:800 12px var(--ui,sans-serif);letter-spacing:.08em}',
      EQ + ' .pro-en.rt-bad{--rc:#d8364a}' + EQ + ' .pro-en.rt-low{--rc:#e07b2b}' + EQ + ' .pro-en.rt-mid{--rc:#c9961a}' + EQ + ' .pro-en.rt-good{--rc:#4fa83a}' + EQ + ' .pro-en.rt-top{--rc:#2a9d61}' + EQ + ' .pro-en.rt-na{--rc:#5a5180}',
      EQ + ' .pro-et{min-width:0;display:flex;flex-direction:column;gap:3px}',
      EQ + ' .pro-et strong{font:900 18px/1.15 var(--display,sans-serif);letter-spacing:.04em}',
      EQ + ' .pro-et p{margin:2px 0 0;font:600 14px/1.35 var(--ui,sans-serif);text-transform:none;letter-spacing:0}',
      EQ + ' .pro-et .pro-sc{color:var(--gold,#ffd23f)}',
      EQ + ' .pro-et .et-goals small{font-size:12px}',
      PEQ + ' .pro-et strong{font-size:var(--ph-row,16px)}' + PEQ + ' .pro-et p{font-size:var(--ph-label,14px)}' + PEQ + ' .pro-en b{font-size:var(--ph-hero,30px)}' + PEQ + ' .pro-en small{font-size:var(--ph-cap,12px)}'
    ].join('\n');
  }
  function injectCss() {
    try {
      if (typeof document === 'undefined' || !document || !document.head || !document.createElement) return;
      if (document.getElementById && document.getElementById('pro-css')) return;
      var s = document.createElement('style'); s.id = 'pro-css'; s.textContent = CSS(); document.head.appendChild(s);
    } catch (e) { }
  }
  function H(HLP) {
    var h = HLP || {};
    return { esc: h.esc || esc, sp: h.sp || function (a) { return a.filter(function (x) { return x !== '' && x != null; }).join(' | '); },
      kitSw: h.kitSw || function () { return ''; }, q: h.q || function () { return ''; }, ph: h.ph || function () { return false; } };
  }
  function kitObj(s) { return { shirt: s.kit[0], accent: s.kit[1], shorts: s.kit[2], pattern: s.pat || 'liso' }; }
  var note = '', arm = { k: '', t: 0 }, forceTab = '';
  function armed(k) { return arm.k === k && now() - arm.t < 3000; }
  /** (ronda 2, carrera-flujo-v) móvil en VERTICAL (html.pv). */
  function pvOn() { var de = typeof document !== 'undefined' && document.documentElement; return !!(de && de.classList && de.classList.contains('pv')); }
  /** En vertical, datos que parten de línea enteros (cada uno sin partir, .pv-sq; el separador va delante de cada dato: nunca «|» suelto al
   *  final de una línea); sin html.pv, el h.sp de siempre (PC y horizontal iguales). */
  function spv(h, a) {
    if (!pvOn()) return h.sp(a, 'v');
    return '<span class="pv-sq">' + a.filter(function (x) { return x != null && x !== ''; }).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</span>';
  }
  function curC() { try { return VB.Career && VB.Career.get ? VB.Career.get() : null; } catch (e) { return null; } }
  function av(k, ch, big) { return '<span class="pro-av' + (big ? ' big' : '') + '" style="--av:' + (AV[k] || '#3a86ff') + '" aria-hidden="true">' + esc(ch || '?') + '</span>'; }
  function head(h, kick, title) { return '<div class="cr-title"><small>' + h.sp(kick.map(function (s) { return h.esc(s); }), 'd') + '</small><b>' + h.esc(title) + '</b></div>'; }
  function scoreTxt(c, m) { var x = c.pro.cast; return m.res ? x.sch[0].ab + ' ' + m.res.sc[0] + '-' + m.res.sc[1] + ' ' + x.sch[m.opp].ab : ''; }
  function pills(h, goals, res) {
    return '<div class="pro-pills" role="list">' + goals.map(function (g, j) {
      var ok = res ? res.ok[j] : undefined, cl = ok === 1 ? ' ok' : ok === 0 ? ' no' : ok === null ? ' na' : '', ic = ok === 1 ? 'Sí' : ok === 0 ? 'No' : ok === null ? '–' : '';
      var sr = ok === 1 ? ', cumplido' : ok === 0 ? ', no cumplido' : ok === null ? ', nadie te vio' : '';
      return '<span class="pro-pill' + cl + '" role="listitem" aria-label="' + h.esc(g.txt + sr) + '"><i aria-hidden="true">' + ic + '</i>' + h.esc(g.txt) + '</span>';
    }).join('') + '</div>';
  }

  // ---- presentación (3 páginas de cómic)
  function renderIntro(c, h) {
    var p = c.pro, x = p.cast, hall = hallC(c), pg = p.pg, b = '';
    if (pg === 0) {
      b += '<div class="pro-panel p1"><span class="pro-pt">Tú</span><div class="pro-who">' + av('team', first(c.player.name).charAt(0), true) + '<div><b>' + h.esc(c.player.name) + '</b><small>' +
        spv(h, ['17 años', h.esc(roleName(c, myPos(c))), 'n.º ' + (c.player.num | 0)]) + '</small><small>' + h.esc(x.sch[0].n + ', ' + x.city) + '</small></div></div>' +
        '<p class="ph-hide">Último curso y una temporada para que te vean.</p>' +
        '<span class="pro-lbl" id="proPersL">¿Cómo eres en la pista?' + (h.ph() ? ' <span class="pro-gchip">' + h.esc(p.pers ? 'Premio: ' + PERS[p.pers].gift : 'Cada una trae un premio') + '</span>' : '') + '</span><div class="roles pro-pers" role="group" aria-labelledby="proPersL">' + PERS_K.map(function (k) {
          return '<button data-act="pro-pers-' + k + '" aria-pressed="' + (p.pers === k) + '">' + h.esc(PERS[k].name) + '<small>' + h.esc(PERS[k].hint) + '</small></button>';
        }).join('') + '</div>' + (h.ph() ? '' : '<p class="pro-gift">' + h.esc(p.pers ? 'Premio: ' + PERS[p.pers].gift + '.' : 'Cada forma de ser trae un pequeño premio.') + '</p>') +
        '<p class="pro-note" role="status" aria-live="polite">' + h.esc(note) + '</p></div>';
    } else if (pg === 1) {
      var C0 = COACHES[x.coach.p];
      b += '<div class="pro-panel p2"><span class="pro-pt">Tu equipo</span><div class="pro-two">' +
        '<div class="pro-card">' + av('coach', x.coach.n.charAt(0), true) + '<div><b class="pro-n">' + h.esc(x.coach.n) + '</b><br><span class="pro-tag">' + h.esc('Te entrena: ' + coachTag(x.coach)) + '</span><p>' + h.esc(C0.line) + '</p></div></div>' +
        '<div class="pro-card">' + av('friend', x.friend.n.charAt(0), true) + '<div><b class="pro-n">' + h.esc(x.friend.n) + '</b><br><span class="pro-tag">' + h.esc(hall ? (x.friend.pos === 'S' ? 'Te coloca' : roleName(c, x.friend.pos)) + ', n.º ' + x.friend.num : 'Tu primera pareja, n.º ' + x.friend.num) + '</span>' +
        '<p>Os conocéis desde primaria y os lo contáis todo.' + (hall ? '' : ' En la arena sois dos y no hay dónde esconderse.') + '</p></div></div></div></div>';
    } else {
      var rv = x.rival, L = VB.CareerLife, sn = L && L.BOSS_STYLES && L.BOSS_STYLES[rv.style] ? L.BOSS_STYLES[rv.style].name : STYLE_NAME[rv.style];
      b += '<div class="pro-panel p3"><span class="pro-pt">Tu rival</span><div class="pro-who">' + av('rival', rv.n.charAt(0), true) + '<div><b>' + h.esc(rv.n) + '</b><small>' +
        spv(h, [h.esc(x.sch[3].n), 'n.º ' + rv.num, 'Estilo: ' + h.esc(sn)]) + '</small></div></div><p>' + h.esc(RIVAL_STORY[rv.style]) + '</p>' +
        '<p>Juega en la otra punta de la ciudad. El derbi es en la jornada 2.</p></div>';
    }
    var sk = armed('pro-skip');
    b += '<div class="card x-go pro-bar"><div class="acts"><button class="pri" data-act="pro-next">' + (pg === 2 ? '¡A la liguilla!' : 'Siguiente') + '</button>' +
      // (en la 1ª página, «Ir directo a las pruebas» en la barra; en las otras, «Atrás»: como mucho 2 botones abajo en el móvil)
      (pg > 0 ? '<button data-act="pro-prev">Atrás</button>' : '<button class="warn" data-act="pro-skip">' + (sk ? 'Confirmar: directo a las pruebas' : 'Ir directo a las pruebas') + '</button>') + '</div></div>';
    return { view: 'intro', head: head(h, ['Presentación', pg === 0 ? 'Tú' : pg === 1 ? 'Tu equipo' : 'Tu rival'], 'Juvenil: ' + (pg + 1) + ' de 3'), tabs: [], tab: '', body: '<div class="pro-intro">' + b + '</div>' };
  }

  // ---- temporada
  function nextCard(c, h) {
    var p = c.pro, x = p.cast, m = p.m[p.i]; if (!m || m.opp < 0) return '';
    var op = x.sch[m.opp], ln = (LINES[m.id] || LINES.j1)[x.coach.p] || '', V = vars(c, p.i);
    ln = ln.replace(/\{(\w+)\}/g, function (a, k) { return V[k] != null ? V[k] : ''; });
    var ai = aiOf(c, m.id), ko = m.id === 'sf' || m.id === 'f' || m.id === 'p3', ph = h.ph();
    // (móvil, movil-aire §5.5: tres filas compactas «J3 A vs B» / «1 set a 15 | IA Fácil» / objetivos; la competición ya va en la cabecera)
    return '<div class="card x-go pro-go"><h3>' + h.esc(MATCH[m.id].lbl) + '</h3>' +
      '<div class="pro-vs">' + (ph ? '<em class="pro-j">' + h.esc(MATCH[m.id].short) + '</em>' : '') + h.kitSw(kitObj(x.sch[0])) + '<b>' + h.esc(x.sch[0].n) + '</b><i>vs</i>' + h.kitSw(kitObj(op)) + '<b>' + h.esc(op.n) + '</b></div>' +
      '<p class="muted">' + spv(h, ['1 set a ' + m.pts, ph ? '' : ko ? h.esc(x.comp.cup) : h.esc(x.comp.lg), h.esc({ 'Fácil': 'Rival flojo', 'Normal': 'Rival parejo', 'Difícil': 'Rival duro', 'Experto': 'Rival muy duro' }[String(ai.name || '').replace(/ suave$/, '')] || '')]) + (ko ? ' <span class="tag y">Ojeadores</span>' : '') + '</p>' +
      pills(h, m.goals, null) +
      '<div class="pro-say">' + av('coach', x.coach.n.charAt(0)) + '<p>' + h.esc(ln) + '</p></div>' +
      '<p class="pro-note" role="status" aria-live="polite">' + h.esc(note) + '</p>' +
      '<div class="acts"><button class="pri" data-act="pro-play">Jugar partido</button><button data-act="pro-sim">Simular<small>Nadie te verá jugar</small></button></div></div>';
  }
  function resultsCard(c, h) {
    var p = c.pro, x = p.cast;
    var rows = p.m.map(function (m, j) {
      if (!m.id) return '<div class="pro-row"><b>5º</b><span class="muted">Final o 3r puesto</span><span class="r muted">—</span></div>';
      var op = m.opp >= 0 ? x.sch[m.opp] : null, lbl = '<b>' + h.esc(MATCH[m.id].short) + '</b>';
      if (!m.res) return '<div class="pro-row' + (j === p.i ? ' next' : '') + '">' + lbl + '<span>' + (op ? 'vs ' + h.esc(op.n) : 'Rival por decidir') + '</span><span class="r muted">' + (j === p.i ? 'Ahora' : 'Pendiente') + '</span></div>';
      var met = m.res.ok.filter(function (v) { return v === 1; }).length;
      return '<div class="pro-row">' + lbl + '<span><span class="' + (m.res.w ? 'w' : 'l') + '">' + (m.res.w ? 'G' : 'P') + '</span> ' + h.esc(scoreTxt(c, m)) + '</span><span class="r">' +
        h.sp(['nota ' + fmt1(m.res.nota), m.res.sim ? 'simulado' : met + ' de 2'], 'v') + '</span></div>';
    }).join('');
    return '<div class="card' + (h.ph() ? ' pro-ih' : '') + '"><h3>Tus partidos</h3><div class="pro-rows">' + rows + '</div></div>';
  }
  function tableCard(c, h) {
    var x = c.pro.cast, t = table(c);
    return '<div class="card pro-tbl"><h3>' + h.esc(x.comp.lg) + '</h3><table><thead><tr><th class="l">Instituto</th><th><abbr title="Partidos jugados">PJ</abbr></th><th><abbr title="Victorias">V</abbr></th><th><abbr title="Diferencia de puntos">Dif.</abbr></th></tr></thead><tbody>' +
      t.map(function (r, j) { var d = r.pf - r.pa; return '<tr' + (r.t === 0 ? ' class="me"' : '') + '><td class="l">' + (j + 1) + '. ' + h.esc(x.sch[r.t].n) + '</td><td>' + r.pj + '</td><td>' + r.w + '</td><td>' + (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="muted">Los 4 pasan al ' + h.esc(x.comp.cup) + ': 1r contra 4º y 2º contra 3r.</p></div>';
  }
  function bracketCard(c, h) {
    var x = c.pro.cast, br = bracket(c); if (!br) return '';
    var row = function (lbl, g) {
      if (!g) return '<div class="pro-row"><b>' + h.esc(lbl) + '</b><span class="muted">Por decidir</span><span class="r muted">—</span></div>';
      var a = x.sch[g[0]], b = x.sch[g[1]], has = g.length > 2;
      return '<div class="pro-row' + (g[0] === 0 || g[1] === 0 ? ' next' : '') + '"><b>' + h.esc(lbl) + '</b><span>' + h.esc(a.ab + ' - ' + b.ab) + '</span><span class="r">' + (has ? g[2] + '-' + g[3] : 'Pendiente') + '</span></div>';
    };
    return '<div class="card"><h3>' + h.esc(x.comp.cup) + '</h3><div class="pro-rows">' + row('Semi', br.semis[0]) + row('Semi', br.semis[1]) + row('Final', br.final) + row('3r puesto', br.p3) + '</div></div>';
  }
  function renderSeason(c, h) {
    var p = c.pro, x = p.cast, sk = armed('pro-rest');
    var left = nextCard(c, h) + resultsCard(c, h), right = (leagueDone(c) ? bracketCard(c, h) : '') + tableCard(c, h);
    var foot = '<div class="card pro-skip"><p class="muted">¿Prisa? Simula lo que falta y pasa al informe. Nadie te verá jugar.</p><button class="warn" data-act="pro-rest">' + (sk ? 'Confirmar: saltar el juvenil' : 'Saltar el juvenil') + '</button></div>';
    return '<div class="pro-cols"><div>' + left + '</div><div>' + right + foot + '</div></div>';
  }
  /** Móvil (movil-aire §5.5): Equipo como UNA lista con secciones de 12 px; cada persona, fila de 56 (avatar, nombre y dato) y la bio
   *  al tocarla (details/summary, sin JS); a .ph-w, dos columnas. */
  function teamPh(c, h) {
    var p = c.pro, x = p.cast, hall = hallC(c), C0 = COACHES[x.coach.p], rv = x.rival, L = VB.CareerLife, ab = armed('pro-abandon');
    var sn = L && L.BOSS_STYLES && L.BOSS_STYLES[rv.style] ? L.BOSS_STYLES[rv.style].name : STYLE_NAME[rv.style];
    var row = function (sec, k, nm, sub, right, bio) {
      return '<div class="pro-ts"><span class="pro-sec">' + h.esc(sec) + '</span><details class="pro-acc"><summary>' + av(k, nm.charAt(0)) + '<span class="pro-an"><b>' + h.esc(nm) + '</b><small>' + sub + '</small></span>' +
        (right ? '<span class="pro-ar">' + right + '</span>' : '') + '<i class="pro-chev" aria-hidden="true">▾</i></summary>' + bio + '</details></div>';
    };
    var b = '<div class="card pro-tl"><div class="pro-tg">' +
      row('Te entrena', 'coach', x.coach.n, h.esc(coachTag(x.coach)), '', '<p>' + h.esc(C0.line) + '</p>') +
      row(hall ? 'Tu mejor amistad' : 'Tu pareja', 'friend', x.friend.n, h.sp(['n.º ' + x.friend.num, h.esc(roleName(c, x.friend.pos))], 'v'), '', '<p>Os conocéis desde primaria y os lo contáis todo.' + (hall ? '' : ' En la arena sois dos y no hay dónde esconderse.') + '</p>') +
      row('Tu rival', 'rival', rv.n, h.sp([h.esc(x.sch[3].n), 'n.º ' + rv.num], 'v'), '<b>' + p.h2h[0] + '-' + p.h2h[1] + '</b>', '<p>Estilo: ' + h.esc(sn) + '. ' + h.esc(RIVAL_STORY[rv.style]) + '</p><p>Cara a cara: ' + p.h2h[0] + '-' + p.h2h[1] + '</p>') +
      '</div>';
    if (hall) b += '<span class="pro-sec">' + h.esc(x.sch[0].n) + '</span><div class="pro-rows pro-mates">' + x.mates.map(function (mt) {
      return '<div class="pro-row"><b>n.º ' + mt.num + '</b><span>' + h.esc(mt.n) + '</span><span class="r muted">' + h.esc(roleName(c, mt.pos)) + '</span></div>';
    }).join('') + '</div>';
    b += '</div><div class="card pro-skip"><p class="muted">Abandonar borra esta Carrera. No se puede deshacer.</p><button class="warn" data-act="pro-abandon">' + (ab ? 'Confirmar: abandonar la Carrera' : 'Abandonar la Carrera') + '</button></div>';
    return b;
  }
  function renderTeam(c, h) {
    if (h.ph()) return teamPh(c, h);
    var p = c.pro, x = p.cast, hall = hallC(c), C0 = COACHES[x.coach.p], rv = x.rival, L = VB.CareerLife;
    var sn = L && L.BOSS_STYLES && L.BOSS_STYLES[rv.style] ? L.BOSS_STYLES[rv.style].name : STYLE_NAME[rv.style], ab = armed('pro-abandon');
    var b = '<div class="pro-two">' +
      '<div class="card"><h3>Te entrena</h3><div class="pro-card">' + av('coach', x.coach.n.charAt(0), true) + '<div><b>' + h.esc(x.coach.n) + '</b><p class="muted">' + h.esc(coachTag(x.coach)) + '</p><p>' + h.esc(C0.line) + '</p></div></div></div>' +
      '<div class="card"><h3>' + (hall ? 'Tu mejor amistad' : 'Tu pareja') + '</h3><div class="pro-card">' + av('friend', x.friend.n.charAt(0), true) + '<div><b>' + h.esc(x.friend.n) + '</b><p class="muted">' +
        h.sp(['n.º ' + x.friend.num, h.esc(roleName(c, x.friend.pos))], 'v') + '</p><p>Os conocéis desde primaria y os lo contáis todo.</p></div></div></div></div>';
    if (hall) b += '<div class="card"><h3>' + h.esc(x.sch[0].n) + '</h3><div class="pro-rows">' + x.mates.map(function (mt) {
      return '<div class="pro-row"><b>n.º ' + mt.num + '</b><span>' + h.esc(mt.n) + '</span><span class="r muted">' + h.esc(roleName(c, mt.pos)) + '</span></div>';
    }).join('') + '</div></div>';
    b += '<div class="card"><h3>Tu rival</h3><div class="pro-card">' + av('rival', rv.n.charAt(0), true) + '<div><b>' + h.esc(rv.n) + '</b><p class="muted">' + h.sp([h.esc(x.sch[3].n), 'n.º ' + rv.num, 'Estilo: ' + h.esc(sn)], 'v') + '</p><p>' +
      h.esc(RIVAL_STORY[rv.style]) + '</p><p><b>Cara a cara: ' + p.h2h[0] + '-' + p.h2h[1] + '</b></p></div></div></div>';
    b += '<div class="card pro-skip"><p class="muted">Abandonar borra esta Carrera. No se puede deshacer.</p><button class="warn" data-act="pro-abandon">' + (ab ? 'Confirmar: abandonar la Carrera' : 'Abandonar la Carrera') + '</button></div>';
    return b;
  }
  function renderChat(c, h) {
    var p = c.pro, l = p.chat.slice().reverse();
    var ph = h.ph(), prev = '';
    var b = '<div class="card"><h3>' + h.esc('Juvenil ' + p.cast.city) + '</h3><div class="pro-msgs">' + (l.length ? l.map(function (e) {
      var T = CH[e.b], k = T.k, nm = senderName(c, k), same = ph && nm === prev; prev = nm;
      if (ph) return '<div class="pro-msg pm-ph' + (e.r ? '' : ' un') + (same ? ' cont' : '') + '">' + (same ? '<span class="pro-av0" aria-hidden="true"></span>' : av(k, nm.charAt(0))) + '<div style="--av:' + (AV[k] || '#fff') + '"><p>' +
        (same ? '<span class="sr">' + h.esc(nm) + ': </span>' : '<b class="pm-n">' + h.esc(nm) + '</b> ') + h.esc(text(c, e)) + '</p></div></div>';
      return '<div class="pro-msg' + (e.r ? '' : ' un') + '">' + av(k, nm.charAt(0)) + '<div style="--av:' + (AV[k] || '#fff') + '"><small>' + h.esc(nm) + '</small><p>' + h.esc(text(c, e)) + '</p></div></div>';
    }).join('') : '<p class="muted">Aún no hay mensajes.</p>') + '</div></div>';
    var n = 0; p.chat.forEach(function (e) { if (!e.r) { e.r = 1; n++; } });
    if (n) { try { K(c).save(c); } catch (e2) { } }
    return b;
  }
  function renderScout(c, h) {
    var p = c.pro, x = p.cast, sp = scoreParts(c), t = p.tier || tierOf(sp.s), T = TIER[t], E = K(c);
    var inv = (c.offers || []).filter(function (o) { return o && obj(o.pscout); }), nt = (c.offers || []).filter(function (o) { return !o.trial; }).length;
    var why = 'La nota sale de tu nota media (hasta 40), los objetivos cumplidos (hasta 25) y las victorias (hasta 35). Simular cuenta poco: nadie te ve jugar.';
    if (h.ph()) return scoutPh(c, h, sp, t, T, inv, nt, why);
    var b = '<div class="card"><h3>Lo que han visto ' + h.q('Informe de los ojeadores', why) + '</h3>' +
      '<div class="pro-stamp t-' + t + '" role="img" aria-label="' + h.esc('Nivel ' + T.name + ', ' + sp.s + ' de 100') + '"><span><b>' + sp.s + '</b><small>' + h.esc(T.name) + '</small></span></div>' +
      '<div class="sp-heros sp-sm" role="group" aria-label="Resumen del juvenil"><span><b class="sp-hn">' + fmt1(sp.avg) + '</b><small class="sp-hl">Nota media</small></span><span><b class="sp-hn">' + sp.met + ' de 10</b><small class="sp-hl">Objetivos</small></span><span><b class="sp-hn">' + sp.wins + ' de 5</b><small class="sp-hl">Victorias</small></span></div>' +
      '<p class="pro-inv">' + h.esc(tierLine(t, hallC(c))) + '</p></div>';
    b += '<div class="card"><h3>Invitaciones</h3>' + (inv.length ? '<div class="pro-rows">' + inv.map(function (o) {
      var k = E.club(c, o.club); return '<div class="pro-row"><b>Prueba</b><span>' + h.esc(k ? k.name : '') + '<br><span class="muted">' + h.esc(cap(ligaOf(c, o))) + '</span></span><span class="r">' + Math.round((o.chance || 0) * 100) + ' %</span></div>';
    }).join('') + '</div>' : '<p class="muted">Ninguna invitación a prueba esta vez.</p>') + '<p class="muted">' + h.esc(plural(nt, 'oferta', 'ofertas') + ' de clubes modestos te esperan también.') + '</p></div>';
    b += '<div class="card"><h3>Hasta pronto</h3><div class="pro-say">' + av('rival', x.rival.n.charAt(0)) + '<p>' + h.esc(x.rival.n + ' también busca club. Os volveréis a ver.') + '</p></div>' +
      '<div class="pro-say">' + av('coach', x.coach.n.charAt(0)) + '<p>' + h.esc(text(c, { b: 'end_coach', i: 5 })) + '</p></div></div>';
    b += '<div class="card x-go pro-bar"><div class="acts"><button class="pri" data-act="pro-offers">Ver ofertas</button></div></div>';
    return { view: 'scout', head: head(h, ['Juvenil', x.comp.cup], 'Informe de los ojeadores'), tabs: [], tab: '', body: b };
  }
  function scoutPh(c, h, sp, t, T, inv, nt, why) {
    var x = c.pro.cast, E = K(c), tl = tierLine(t, hallC(c));
    var pv = pvOn(), hq = h.q('Informe de los ojeadores', tl + ' ' + why).replace('class="sp-q cr-q"', 'class="sp-q cr-q pro-hq"');
    var b = '<div class="card pro-sc"><div class="pro-band">' +
      '<div class="pro-stamp t-' + t + '" role="img" aria-label="' + h.esc('Nivel ' + T.name + ', ' + sp.s + ' de 100') + '"><span><b>' + sp.s + '</b><small>' + h.esc(T.name) + '</small></span></div>' +
      (pv ? '<b class="pro-tn" aria-hidden="true">' + h.esc(T.name) + '</b>' + hq : '') +
      '<div class="sp-heros sp-sm" role="group" aria-label="Resumen del juvenil"><span><b class="sp-hn">' + fmt1(sp.avg) + '</b><small class="sp-hl">Nota</small></span><span><b class="sp-hn">' + sp.met + '/10</b><small class="sp-hl">Objetivos</small></span><span><b class="sp-hn">' + sp.wins + '/5</b><small class="sp-hl">Victorias</small></span></div></div>' +
      '<p class="pro-inv">' + h.esc(tl) + '</p></div>';
    b += '<div class="card pro-iv pro-ih"><h3>Invitaciones</h3>' + (inv.length ? '<div class="pro-rows">' + inv.map(function (o) {
      var k = E.club(c, o.club); return '<div class="pro-row"><b>Prueba</b><span class="pro-ivn">' + h.sp([h.esc(k ? k.name : ''), '<span class="muted">' + h.esc(cap(ligaOf(c, o))) + '</span>'], 'v') + '</span><span class="r">' + Math.round((o.chance || 0) * 100) + ' %</span></div>';
    }).join('') + '</div>' : '<p class="muted">Ninguna invitación a prueba esta vez.</p>') + '<p class="muted">' + h.esc(plural(nt, 'oferta', 'ofertas') + ' de clubes modestos te esperan también.') + '</p></div>';
    b += '<div class="card"><h3>Hasta pronto</h3><div class="pro-say">' + av('rival', x.rival.n.charAt(0)) + '<p>' + h.esc(x.rival.n + ' también busca club. Os volveréis a ver.') + '</p></div>' +
      '<div class="pro-say">' + av('coach', x.coach.n.charAt(0)) + '<p>' + h.esc(text(c, { b: 'end_coach', i: 5 })) + '</p></div></div>';
    b += '<div class="card x-go pro-bar"><div class="acts"><button class="pri" data-act="pro-offers">Ver ofertas</button></div></div>';
    // (el «?» con la explicación, en la cabecera: fuera el sello «Lo que han visto»; en vertical, al final de la fila del círculo)
    return { view: 'scout', head: head(h, ['Juvenil', x.comp.cup], 'Informe de los ojeadores') + (pv ? '' : hq), tabs: [], tab: '', body: b };
  }
  function tierLine(t, hall) {
    return { joya: hall ? 'Joya. Tres invitaciones a prueba, una en un club de arriba. Los ojeadores se pelean por tu teléfono.' : 'Joya. Tres invitaciones a prueba, una muy por encima de tu nivel. Los ojeadores se pelean por tu teléfono.',
      promesa: 'Promesa. Dos invitaciones a prueba y algo más de confianza en que la superes.',
      inter: 'Interesante. Una invitación a prueba segura. Algo has enseñado.',
      monton: 'Del montón. Las ofertas de siempre. Nadie se ha mojado todavía.',
      nadie: 'Invisible. Ofertas de clubes modestos y ninguna prueba.' }[t] || '';
  }
  /** Hub del prólogo: {view, head, tabs: [[id, texto, punto]], tab, body}. */
  function render(c, HLP, o) {
    injectCss();
    var h = H(HLP), p = ensure(c); if (!p) return { view: 'none', head: '', tabs: [], tab: '', body: '' };
    if (p.st === 'intro') { var ri = renderIntro(c, h); note = ''; return ri; }
    if (p.st === 'scout') return renderScout(c, h);
    var tab = forceTab || (o && o.tab) || 'season'; forceTab = '';
    if (['season', 'team', 'chat'].indexOf(tab) < 0) tab = 'season';
    var un = unreadChat(c), body = tab === 'team' ? renderTeam(c, h) : tab === 'chat' ? renderChat(c, h) : renderSeason(c, h);
    note = '';
    var m = p.m[Math.min(4, p.i)], x = p.cast;
    var lgN = m && (m.id === 'sf' || m.id === 'f' || m.id === 'p3' || !m.id) ? x.comp.cup : x.comp.lg;
    var pvV = !!(VB.Splat && VB.Splat.pv && VB.Splat.pv());   // (ronda 2, vertical: antetítulo de una pieza «J3 de 5» y la liga de título)
    return { view: tab, head: pvV ? head(h, ['J' + (p.i + 1) + ' de 5'], lgN) : head(h, ['Juvenil', 'J' + (p.i + 1) + ' de 5', lgN], 'Juvenil'),
      tabs: [['season', 'Temporada', false], ['team', 'Equipo', false], ['chat', 'Chat', tab !== 'chat' && un > 0]], tab: tab, body: body };
  }
  function twoTap(k) { if (armed(k)) { arm = { k: '', t: 0 }; return true; } arm = { k: k, t: now() }; return false; }
  /** Acciones 'pro-…' (career-ui onClick): {render, focus, snd} | {tab} | {play: {id, arg}} | {view: 'create'} | null. */
  function act(a, btn, ctx) {
    if (a === 'pro-start') { var f = ctx && ctx.form; if (f) f.pro = btn && btn.getAttribute && btn.getAttribute('data-v') === 'skip' ? 'skip' : 'pro'; return { render: true, snd: 'select' }; }
    var c = curC(), p = ensure(c); if (!p) return null;
    if (a.indexOf('pro-pers-') === 0) { setPers(c, a.slice(9)); note = ''; return { render: true, snd: 'select' }; }
    if (a === 'pro-next') {
      var r = page(c, 1);
      if (r === 'pers') { note = 'Elige antes cómo eres en la pista.'; return { render: true, ok: false, focus: '[data-act^="pro-pers-"]' }; }
      if (r === 'season') return { tab: 'season', focus: '.x-go .pri', snd: 'start' };
      return { render: true, focus: '.x-go .pri' };
    }
    if (a === 'pro-prev') { page(c, -1); return { render: true, focus: '.x-go .pri', snd: 'back' }; }
    if (a === 'pro-skip') { if (!twoTap(a)) return { render: true, snd: 'select' }; skip(c); return { render: true, snd: 'start' }; }
    if (a === 'pro-play') { var n = next(c); if (!n) return null; return { play: { id: 'pro', arg: (hallC(c) ? 'hall' : 'beach') + ':' + p.i, auto: false } }; }
    if (a === 'pro-sim') {
      var s = sim(c); if (!s) return null;
      note = 'Simulado: ' + (s.win ? 'ganáis ' : 'perdéis ') + s.sc[0] + '-' + s.sc[1] + '. Nadie te ha visto.';
      return { render: true, focus: p.st === 'season' ? '.x-go .pri' : '.x-go .pri', snd: 'click' };
    }
    if (a === 'pro-rest') { if (!twoTap(a)) return { render: true, snd: 'select' }; skipRest(c); return { render: true, focus: '.x-go .pri', snd: 'start' }; }
    if (a === 'pro-offers') { if (p.st !== 'scout') return null; p.st = 'done'; K(c).save(c); return { render: true, snd: 'start' }; }
    if (a === 'pro-abandon') { if (!twoTap(a)) return { render: true, snd: 'select' }; try { K(c).abandon(); } catch (e) { } return { view: 'create' }; }
    if (a.indexOf('pro-tab-') === 0) return { tab: a.slice(8) };
    return null;
  }
  function createRow(form, hall, HLP) {
    injectCss();
    var h = H(HLP); if (!form) return '';
    if (form.pro !== 'skip') form.pro = 'pro';
    // (móvil, movil-aire §5.5: la explicación entera tras el «?»; en el botón, una línea)
    var qi = h.ph() ? h.q('Inicio', 'Desde juvenil: una temporada corta con tu instituto y un torneo con ojeadores; según lo que vean, llegan invitaciones a prueba. Directo a las pruebas: las ofertas llegan ya.') : '';
    return '<div><label>Inicio' + qi + '</label><div class="roles" role="group" aria-label="Cómo empiezas">' +
      '<button data-act="pro-start" data-v="pro" aria-pressed="' + (form.pro === 'pro') + '">Desde juvenil<small>' + (h.ph() ? 'Una temporada con tu instituto' : 'Una temporada corta con tu instituto y un torneo con ojeadores') + '</small></button>' +
      '<button data-act="pro-start" data-v="skip" aria-pressed="' + (form.pro === 'skip') + '">Directo a las pruebas<small>Las ofertas llegan ya</small></button></div></div>';
  }
  function offerLine(c, o, HLP) {
    var p = c && obj(c.pro) ? c.pro : null; if (!p || !o || !obj(o.pscout) || !p.cast) return '';
    var h = H(HLP), T = TIER[o.pscout.tier];
    return '<p class="muted pro-ol">' + h.esc('Te vio en el ' + p.cast.comp.cup + (T ? ': nivel ' + T.name : '') + '.') + '</p>';
  }

  // ---- hoja final del partido (main.js careerExtSheet: html + title + kicker + back)
  function rtBand(v) { if (v == null) return 'rt-na'; v = round1(v); return v < 5 ? 'rt-bad' : v < 6 ? 'rt-low' : v < 7 ? 'rt-mid' : v < 8 ? 'rt-good' : 'rt-top'; }
  function titleOf(id, win) { return id === 'f' ? (win ? '¡Título!' : 'Plata') : id === 'p3' ? (win ? '¡Bronce!' : 'Cuartos') : win ? 'Victoria' : 'Derrota'; }
  function sheetData(d) {
    var gl = (d.goals || []).map(function (g) {
      var ok = g.ok === true, no = g.ok === false;
      // (móvil, movil-aire §5.5: el objetivo en corto en una ficha de una línea; en PC, el largo: .ph-only / .ph-no)
      var gs = String(g.txt || '').replace(/^Como mucho (\d+)/, '≤ $1').replace(/^Nota de ([\d,]+) o más$/, 'Nota ≥ $1');
      var gt = gs !== g.txt ? '<span class="ph-no">' + esc(g.txt) + '</span><span class="ph-only" aria-hidden="true">' + esc(gs) + '</span>' : esc(g.txt);
      return '<span class="' + (ok ? 'ok' : no ? 'no' : '') + '"><i aria-hidden="true">' + (ok ? 'Sí' : no ? 'No' : '–') + '</i>' + gt + (g.v != null ? ' <small>(' + (g.v | 0) + ')</small>' : '') + '<span class="sr">' + (ok ? ', cumplido' : no ? ', no cumplido' : ', nadie te vio') + '</span></span>';
    }).join('');
    var html = '<div class="pro-end"><div class="pro-en ' + rtBand(d.nota) + '" aria-label="' + esc('Nota ' + fmt1(d.nota)) + '"><b>' + fmt1(d.nota) + '</b><small>NOTA</small></div>' +
      '<div class="pro-et"><strong class="pro-sc">' + esc(d.score) + '</strong>' + (gl ? '<div class="et-goals">' + gl + '</div>' : '') +
      (d.line ? '<p>' + esc(d.line) + '</p>' : '') + (d.scouts ? '<p>Los ojeadores toman nota.</p>' : '') + (d.last ? '<p>Mira el informe en la Carrera.</p>' : '') + '</div></div>';
    return { title: d.title, kicker: d.kicker, html: html, back: 'Volver al juvenil', nota: d.nota, win: d.win, pro: 1 };
  }
  function sheetFor(c, out) {
    var p = c.pro, x = p.cast, m = p.m[out.i], wl = out.win ? 'post_w_coach' : 'post_l_coach';
    var line = text(c, { b: out.sim ? 'sim_coach' : wl, i: out.i });
    return sheetData({ title: titleOf(out.id, out.win), kicker: [out.id === 'sf' || out.id === 'f' || out.id === 'p3' ? x.comp.cup : 'Juvenil', out.id === 'f' ? 'Final' : MATCH[out.id].lbl],
      nota: out.nota, goals: out.goals, score: x.sch[0].ab + ' ' + out.sc[0] + '-' + out.sc[1] + ' ' + x.sch[m.opp].ab, line: line,
      scouts: out.id === 'sf' || out.id === 'f', last: !!out.last, win: out.win });
  }
  function sheet() { injectCss(); }

  // ================================================================== carga de la carrera de un partido y escenas de prueba
  function argOf(arg) { var s = String(arg == null ? '' : arg), j = s.indexOf(':'); return { mode: j >= 0 && s.slice(0, j) === 'hall' ? 'hall' : 'beach', i: clampI(j >= 0 ? s.slice(j + 1) : s, 0, 9) }; }
  function loadMode(mode) { var C = VB.Career; if (!C) return null; var E = mode === 'hall' ? C.hall : C.beach; try { return E && E.load ? E.load() : null; } catch (e) { return null; } }
  var DEMO_ST = { kills: 3, aces: 1, blocks: 1, digs: 4, assists: 5, errors: 2, recvP: 2, perfect: 2, good: 3, poor: 2, serves: 6 };
  /** Carrera de prueba (semilla 4242, «Ares Belmonte», n.º 7, cr / OH) llevada a stage: intro | intro3 | season | team | chat | scout. */
  function dbg(mode, stage) {
    var C = VB.Career; if (!C || !C.create) return null;
    var hall = mode === 'hall';
    var c = C.create(hall ? { mode: 'hall', name: 'Ares Belmonte', num: 7, pos: 'OH', seed: 4242, prologue: true, now: 1 } : { mode: 'beach', name: 'Ares Belmonte', num: 7, role: 'cr', seed: 4242, prologue: true, now: 1 });
    if (!c || !ensure(c)) return null;
    var p = c.pro;
    if (stage === 'intro') { K(c).save(c); return c; }
    if (stage === 'intro3') { p.pers = 'lead'; p.pg = 2; K(c).save(c); return c; }
    p.pers = 'work'; p.pg = 2; page(c, 1);
    var plays = stage === 'scout' ? 5 : 2, wins = [1, 0, 1, 1, 1];
    for (var j = 0; j < plays && p.st === 'season'; j++) {
      var m = p.m[p.i], w = wins[j] === 1, sc = w ? [m.pts, m.pts - 4 - j] : [m.pts - 3, m.pts];
      doneWith(c, { sets: w ? [1, 0] : [0, 1], setScores: [sc], win: w }, DEMO_ST, null, sc[0] + sc[1]);
    }
    if (stage === 'chat') { p.chat.forEach(function (e, j) { e.r = j < p.chat.length - 3 ? 1 : 0; }); }
    K(c).save(c);
    return c;
  }
  function demo(c, tipo) {
    var s = String(tipo || ''), j = s.indexOf(':'), mode = j >= 0 ? s.slice(0, j) : 'beach', st = j >= 0 ? s.slice(j + 1) : s;
    var cc = dbg(mode === 'hall' ? 'hall' : 'beach', st || 'intro'); if (!cc) return false;
    forceTab = st === 'team' ? 'team' : st === 'chat' ? 'chat' : st === 'season' ? 'season' : '';
    note = ''; arm = { k: '', t: 0 };
    return true;
  }
  function endDemo(k) {
    var lose = k === 'lose';
    var out = sheetData({ title: titleOf(k === 'final' ? 'f' : 'j2', !lose), kicker: ['Juvenil', 'Jornada 2: el derbi'], nota: lose ? 5.8 : 7.4,
      goals: [{ txt: 'Gana el derbi', ok: !lose, v: null }, { txt: 'Como mucho 2 errores', ok: true, v: 1 }],
      score: lose ? 'FAR 12-15 MON' : 'FAR 15-11 MON', line: lose ? 'Perder también se entrena. Mañana, más.' : '¡ESO ES, FAMILIA! Mañana más.', scouts: false, last: false, win: !lose });
    out.dbgSets = [lose ? [12, 15] : [15, 11]];   // (main.js: el marcador de la cabecera, el mismo que el de la hoja)
    return out;
  }

  // ================================================================== API y registros
  VB.CareerPrologue = {
    ensure: ensure, active: active, start: start, hero: hero, next: next, table: table, bracket: bracket, semis: semis,
    setup: setup, done: done, quit: quit, sim: sim, skipRest: skipRest, skip: skip, finish: finish,
    score: score, scoreParts: scoreParts, tierOf: tierOf, offers: offers, baseOffers: baseOffers,
    kidRival: kidRival, setPers: setPers, page: page, onJoin: onJoin, text: text, unread: unreadChat,
    TIER: TIER, TIER_K: TIER_K, PRO_AI: PRO_AI, GOALS: GOALS, CH: CH, MOMENTS: MOMENTS, LINES: LINES, AGENT_TX: AGENT_TX, SCHOOLS: SCHOOLS, COACHES: COACHES,
    PERS: PERS, RIVAL_STORY: RIVAL_STORY, MATCH: MATCH, CHANCE_MAX: CHANCE_MAX, FOLLOW: FOLLOW,
    _doneWith: doneWith, _dbg: dbg, _vars: vars, _variants: variants, _aiOf: aiOf, _buildCast: buildCast
  };
  VB.CareerPrologueUI = {
    render: render, act: act, createRow: createRow, offerLine: offerLine, sheet: sheet, hero: hero,
    _css: CSS, _tab: function (t) { forceTab = t || ''; }, _sheet: sheetData, _note: function () { return note; }
  };
  (VB.CareerExt = VB.CareerExt || []).push({
    id: 'pro',
    hook: function (c, kind) { if (kind === 'join') onJoin(c); },
    /** Partido del juvenil (main.js startCareerExt): arg = 'beach:2' | 'hall:0'. Reiniciar lo vuelve a llamar. */
    setup: function (arg) { var a = argOf(arg), c = loadMode(a.mode); return c ? setup(c, a.i) : null; },
    done: function (res, g) {
      var cs = (g && g.career) || {}, a = argOf(cs.extArg), c = loadMode(cs.mode || a.mode);
      var p = c ? ensure(c) : null, out = p && p.i === a.i ? done(c, res, g) : null;   // (solo el partido que toca: nunca dos veces)
      if (!out) return { title: 'Partido cerrado', kicker: ['Juvenil'], html: '<p>Este partido del juvenil ya estaba cerrado.</p>', back: 'Volver al juvenil' };
      return sheetFor(c, out);
    },
    quit: function (cs) { var a = argOf(cs && cs.extArg), c = loadMode((cs && cs.mode) || a.mode); if (c) quit(c); },
    sheet: function () { injectCss(); },
    back: 'Volver al juvenil',
    _demo: demo, _endDemo: endDemo
  });
  (VB.CareerUIExt = VB.CareerUIExt || []).push({
    id: 'pro', prefix: 'pro-',
    takeover: function (c) { return active(c); },
    render: render, act: act, hero: function (c) { return active(c) ? hero(c) : null; },
    createRow: createRow,
    createLabel: function (form) { return form && form.pro !== 'skip' ? 'Crear y empezar el juvenil' : ''; },
    createOpts: function (form) { return { prologue: !!(form && form.pro !== 'skip') }; },
    offerLine: offerLine,
    msgK: { pro: 'Juvenil' }
  });
})(typeof window !== 'undefined' ? window : globalThis);
