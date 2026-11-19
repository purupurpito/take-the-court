/* =====================================================================
 * MAKE THE CUT — js/doll.js   (owner: players; MODELO DE PERSONAJE del juego, fase 2 integrada el 10-nov-2026)
 * MUÑECO («doll»): figura redondeada y limpia de muñeco articulado (Switch Sports / Sackboy) con caricatura de
 * cómic (Windjammers 2 / Mario Strikers): cabeza grande sin cuello, cara enorme dibujada, tubos con bolas en las
 * articulaciones, manoplas y zapatones, ropa PINTADA en la textura, contorno de tinta de color y dos bandas de sombra.
 *
 * Este fichero construye la GEOMETRÍA (VB.Doll.geometry), el ATLAS/MATERIAL (VB.Doll.material) y las celdas de la cara
 * (VB.Doll.faceCells) de cada jugador; players.js monta el esqueleto con las longitudes de VB.Doll.dims() y lo anima
 * (IK con estirón cartoon, poses, celebraciones). Mismo esqueleto de 27 huesos, mismos nombres y orden: body, pelvis,
 * spine, chest, head, eyes, mouth, teeth, browL, browR, hair, [sh, up, el, hand, hip, th, kn, ft] × izquierda/derecha.
 * El ALCANCE con el brazo ESTIRADO (hombro + brazo×estirón + antebrazo×estirón + palma) es el del atleta TAJO para el
 * que se afinó la animación (REACH_WANT = 2,192 m); el brazo de reposo es corto y players.js lo estira en la IK.
 *
 * Espacio del cuerpo como en players: mira a +Z, +X es su IZQUIERDA, +Y arriba, origen entre los pies.
 * Equipaciones: los objetos de players.js (setKit / liberoKit: base, accent, dark, trim, shorts, pad, sole, numFill,
 * pattern, libero). Playa (`beach`): tirantes, malla corta, descalzo con pies de muñeco, visera / gorra / gafas / cinta.
 * La escena ?debug=doll (maqueta: VB.Doll.start desde main.js) sigue funcionando con sus 4 muñecos.
 * VESTUARIO (13-nov-2026, spec «Vestuario» §4): el aspecto L (VB.Look.resolve, o la L vieja {skin, hair, style, acc}) se normaliza
 * con normLook y lo dibujan las piezas por ranura (peinados, gorros, gafas, cuello, muñecas, manos, rodilleras, tobillera, zapatillas)
 * y el atlas (tiras por columna con la u propia del tubo, pintura de cara, marcas, gafas pintadas, barba, licra); todo en la misma
 * malla y el mismo atlas (cero dibujos y programas nuevos). VB.Doll.preview es la vista previa del menú y VB.Doll.lookSelfTest su
 * prueba en el navegador. Nada de esto toca la sim. Notas: notes/players.md § Vestuario.
 * T21 (sprint 2-4, notes/s234/T21.md): los 5 objetos de jefe con dibujo propio (misma geometría que su base; color por cara con
 * G.vc o atlas) y el encuadre del retrato según el tamaño (ptZoom: cara a 44 px, busto a 88 px).
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var THREE, ctx, PI = Math.PI;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mixHex(a, b, t) {
    var ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  }
  function lumHex(h) { return (0.2126 * (h >> 16 & 255) + 0.7152 * (h >> 8 & 255) + 0.0722 * (h & 255)) / 255; }
  function hexCss(h) { return '#' + ('000000' + h.toString(16)).slice(-6); }

  // ---------- Proporciones del muñeco (m): presets de cuerpo ----------
  // `chibi` (por defecto, 10-nov-2026, «¿más chibi?»): ~3,3 cabezas (cabeza 0,50 m, algo más ancha que alta), piernas 0,58 (zapatón
  // incluido), tronco 0,605 corto y redondo por abajo, hombros a 1,185, de pie 1,64 m. `v1` = la primera maqueta (4,4 cabezas, 1,86 m).
  // En los dos el ALCANCE con el brazo estirado es el del atleta (fitReach): lo que baja el hombro lo pone el brazo (de muñeco).
  // ?body=v1 lo elige en la escena; VB.Doll.setBody(nombre) cambia en caliente (pruebas y comparación antes/después).
  var BODIES = {
    v1: { ANKLE: 0.12, THIGH: 0.33, SHIN: 0.33, HIP_W: 0.085, SPINE_Y: 0.22, CHEST_Y: 0.22, SH_Y: 0.23, SH_X: 0.17, PALM: 0.10,
      HEAD_C: 0.20, HEAD_RX: 0.20, HEAD_RY: 0.21, HEAD_RZ: 0.195, TUBE_ARM: 0.047, TUBE_LEG: 0.054, BALL_SH: 0.08, BALL_EL: 0.056, BALL_KN: 0.066, BALL_HIP: 0.06,
      HAND_K: 1, FOOT_K: 1, TORSO_W: 1 },
    // ARM = hombro→muñeca en REPOSO (0,635 + palma 0,115 = 0,75 hombro→palma: la manopla cuelga a la altura de la cadera); lo que falta
    // hasta el alcance del atleta lo pone el ESTIRÓN cartoon de la IK (reachTo, hasta ×STRETCH_MAX ≈ 1,41). Sin ARM (v1): brazo a medida.
    // (11-nov-2026, Ferran: «los brazos largos no me convencen… en el momento normal»): ARM 0,635 → 0,47 (la manopla cuelga en la
    // cadera, no en la rodilla: el brazo era más largo que la pierna entera), tubo del brazo 0,05 → 0,06 y bolas de hombro y codo algo
    // mayores (brazo rechoncho de chibi, no palo). El estirón que cubre el alcance sube de ×1,4 a ×1,9 (solo en el contacto).
    chibi: { ANKLE: 0.12, THIGH: 0.23, SHIN: 0.23, HIP_W: 0.09, SPINE_Y: 0.2, CHEST_Y: 0.2, SH_Y: 0.205, SH_X: 0.175, PALM: 0.115, ARM: 0.47,
      HEAD_C: 0.205, HEAD_RX: 0.245, HEAD_RY: 0.25, HEAD_RZ: 0.235, TUBE_ARM: 0.06, TUBE_LEG: 0.058, BALL_SH: 0.095, BALL_EL: 0.07, BALL_KN: 0.07, BALL_HIP: 0.064,
      HAND_K: 1.15, FOOT_K: 1.15, TORSO_W: 1.12 }
  };
  var BODY = 'chibi';
  var ANKLE, THIGH, SHIN, HIP_H, HIP_W, SPINE_Y, CHEST_Y, SH_Y, SH_X, SH_Z = 0.0, SH_H, NECK_Y, PALM, UPPER, FORE;
  var HEAD_C, HEAD_RX, HEAD_RY, HEAD_RZ, TUBE_ARM, TUBE_LEG, BALL_SH, BALL_EL, BALL_KN, BALL_HIP, HAND_K, FOOT_K, TORSO_W;
  // derivados: FK = escala de la cara/pelo respecto a la cabeza de v1 (los rasgos se dibujan en metros de v1 y se escalan);
  // TORSO_K = escala vertical del perfil del tronco (diseñado para un tronco de 0,67); TR_Y0/1 = alturas de reposo que cubre la camiseta
  var HEAD_C0 = 0.20, HEAD_RY0 = 0.21, FK = 1, TORSO_K = 1, TR_Y0 = 0, TR_Y1 = 1;
  // REACH_WANT: alcance del atleta TAJO (cadera 1,042 + tronco 0,493 + brazo 0,3 + antebrazo 0,27 + palma 0,087) para el que
  // se afinó toda la animación de players.js: el muñeco estirado llega a lo mismo (constante: players ya no publica otro modelo)
  var REACH_WANT = 2.192, REACH = 0, REACH_REST = 0, STRETCH_MAX = 1, ARM_REST = 0;   // alcance del atleta; del muñeco estirado / en reposo; tope del estirón
  function applyDims(name) {
    var b = BODIES[name] || BODIES.chibi; BODY = BODIES[name] ? name : 'chibi';
    ANKLE = b.ANKLE; THIGH = b.THIGH; SHIN = b.SHIN; HIP_H = THIGH + SHIN + ANKLE; HIP_W = b.HIP_W;
    SPINE_Y = b.SPINE_Y; CHEST_Y = b.CHEST_Y; SH_Y = b.SH_Y; SH_X = b.SH_X; SH_H = HIP_H + SPINE_Y + CHEST_Y + SH_Y;
    NECK_Y = SH_Y;                           // la cabeza nace a la altura de los hombros (sin cuello)
    PALM = b.PALM;                           // muñeca → centro de la manopla (la palma se apoya en el balón)
    HEAD_C = b.HEAD_C; HEAD_RX = b.HEAD_RX; HEAD_RY = b.HEAD_RY; HEAD_RZ = b.HEAD_RZ;
    TUBE_ARM = b.TUBE_ARM; TUBE_LEG = b.TUBE_LEG; BALL_SH = b.BALL_SH; BALL_EL = b.BALL_EL; BALL_KN = b.BALL_KN; BALL_HIP = b.BALL_HIP;
    HAND_K = b.HAND_K; FOOT_K = b.FOOT_K; TORSO_W = b.TORSO_W;
    FK = HEAD_RY / HEAD_RY0; TORSO_K = (SPINE_Y + CHEST_Y + SH_Y) / 0.67;
    TR_Y0 = HIP_H - 0.13 * TORSO_K; TR_Y1 = HIP_H + 0.70 * TORSO_K;
    ARM_REST = b.ARM || 0;
    fitReach();
  }

  /** Alcance del atleta (VB.Players.dims().reach). Sin ARM en el preset, el brazo se hace a medida (hombro + brazo + antebrazo + palma =
   *  alcance, proporción 0,52/0,48) y no hay estirón. Con ARM (chibi), el brazo de reposo es corto y STRETCH_MAX es el factor de
   *  estiramiento de brazo + antebrazo que cubre el alcance: lo aplica reachTo cuando el objetivo queda fuera. */
  function fitReach() {
    var arm = ARM_REST > 0 ? ARM_REST : REACH_WANT - SH_H - PALM;
    UPPER = arm * 0.52; FORE = arm * 0.48;
    REACH_REST = SH_H + UPPER + FORE + PALM;
    STRETCH_MAX = Math.max(1, (REACH_WANT - SH_H - PALM) / (UPPER + FORE));
    REACH = SH_H + (UPPER + FORE) * STRETCH_MAX + PALM;
  }

  // ---------- Equipos (misma paleta que players) ----------
  var TEAMS = [
    { base: 0xff5a2c, accent: 0xffb238, dark: 0x6e1606, trim: 0xffffff, shorts: 0x191b22, pad: 0x1d1f26, sole: 0xff6a2a, numFill: '#ffffff' },
    { base: 0x3363ea, accent: 0xbcd8ff, dark: 0x0b2766, trim: 0xffffff, shorts: 0x0b0e17, pad: 0x141a2a, sole: 0x2f7bff, numFill: '#ffffff' }
  ];
  var INK = 0x1d1530;
  function inkHex(tc) { return mixHex(tc.dark, INK, 0.35); }
  function tajoFill(tc) { return lumHex(tc.base) > 0.62 ? tc.accent : 0xf8f8f4; }
  /** Color de la crema de zinc (playa): el acento del equipo llevado a neón (muy saturado y claro); acento gris: cian. */
  function zincHex(tc) {
    var c = new THREE.Color(tc.accent), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    if (hsl.s < 0.25) return 0x3ff0ff;
    c.setHSL(hsl.h, 1, clamp(hsl.l, 0.55, 0.62)); return c.getHex();
  }
  // las medidas son números puros: se calculan al cargar (players.js las lee en init con VB.Doll.dims(), antes de que haya THREE aquí)
  applyDims(BODY);

  // Aspectos de la maqueta (4 muñecos): piel, pelo, peinado, complemento, equipo, dorsal, expresión y pose
  var LOOKS = [
    { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: 'gorra', team: 0, num: 7, face: 'neutra', pose: 'idle' },
    { skin: 0x8a5638, hair: 0x241a14, style: 'afro', acc: 'cinta', team: 0, num: 11, face: 'concentrado', pose: 'recv' },
    { skin: 0xf0c6a4, hair: 0x7a3a16, style: 'coleta', acc: 'visera', team: 1, num: 3, face: 'grito', pose: 'spike' },
    { skin: 0xc68a5f, hair: 0x1e1612, style: 'mono', acc: 'gafas', team: 1, num: 9, face: 'alegria', pose: 'cel' }
  ];
  // (las listas de peinados y complementos son las de VB.Look: STYLES, items('head'); aquí ya no hay copias)

  // ---------- VESTUARIO (spec «Vestuario» §1-§4): lo que sabe dibujar el muñeco por ranura ----------
  // id → sede ('A' ambas, 'P' pista, 'Y' playa). El catálogo con nombres, rarezas y desbloqueos es de js/look.js (VB.Look); aquí solo
  // está lo que hace falta para DIBUJAR. La sede solo se impone donde cambia el sentido de la pieza (VENUE_STRICT: interior,
  // calcetines, tobillera y zapatillas); el resto se dibuja tal cual llega (la maqueta ?debug=doll lleva gorra y gafas en pista).
  var ARMS = { manguito: 'P', manguitoRayas: 'P', manguitoCuadros: 'P', manguitoLlamas: 'P', manguitoRayos: 'P', manguitoOro: 'P', kinesio: 'A', manguitoMazo: 'P' };   // manguitos solo en pista (1.1.1)
  var ITEMS = {
    style: { tupe: 'A', coleta: 'A', afro: 'A', flequillo: 'A', rapado: 'A', mono: 'A', trenzas: 'A', dosmonos: 'A', coletas: 'A', cresta: 'A' },
    head: { cinta: 'A', cintaRizo: 'A', bandana: 'A', gorra: 'Y', gorraAtras: 'Y', visera: 'Y', pescador: 'Y', corona: 'A', gorraMTC: 'A' },
    eyes: { frente: 'Y', pasta: 'A', oscuras: 'Y', deporte: 'A', espejo: 'Y' },
    paint: { zinc: 'Y', rayas: 'A', rayasEq: 'A', estrella: 'A' },
    marks: { pecas: 'A', tirita: 'A', tiraNasal: 'A' },
    beard: { bigote: 'A', perilla: 'A', tresDias: 'A' },
    neck: { medalla: 'A', conchas: 'Y' },
    under: { termica: 'P', licra: 'Y' },
    band: { capitan: 'A' },
    armL: ARMS, armR: ARMS,
    elbows: { coderas: 'P' },
    wristL: { muneq: 'A', reloj: 'A', munhCanon: 'A' }, wristR: { muneq: 'A', reloj: 'A', munhCanon: 'A' },
    hands: { dedos: 'A', mitones: 'Y', dedosMuro: 'A' },
    legs: { malla: 'A', mallaLarga: 'A' },
    knees: { cortas: 'P', altas: 'P', bajadas: 'P', rodiPulpo: 'P' },
    socks: { tobilleros: 'P', media: 'P', altos: 'P', altosRayas: 'P', desparejados: 'P' },
    ankle: { blanca: 'P', tela: 'Y', pulseraTob: 'Y', escarpines: 'Y', tobiPulpo: 'Y' },
    shoes: { clasicas: 'P', negras: 'P', neon: 'P', doradas: 'P' },
    hairFx: {}   // efectos de pelo (fit.hairFx, 1.16): aún ninguno
  };
  var LOOK_SLOTS = ['head', 'eyes', 'paint', 'marks', 'beard', 'neck', 'under', 'band', 'armL', 'armR', 'elbows', 'wristL', 'wristR',
    'hands', 'legs', 'knees', 'socks', 'ankle', 'shoes'];
  var VENUE_STRICT = { under: 1, socks: 1, ankle: 1, shoes: 1 };
  // lo que lleva cada sede cuando el campo no llega (L viejas {skin, hair, style, acc} y NPC): exactamente lo de hoy
  var SLOT_DEF = { hall: { knees: 'cortas', socks: 'media', ankle: 'blanca', shoes: 'clasicas' }, beach: { paint: 'zinc', ankle: 'tela' } };
  // gorros que sustituyen al pelo (se dibuja el casquete de la nuca; coleta, trenzas y coletas salen por debajo)
  var HIDE_HAIR = { gorra: 1, gorraAtras: 1, pescador: 1, gorraMTC: 1 };
  var GOLD = 0xf2c14e, GOLD_HI = 0xfff1b0, NEUTRAL_DK = 0x22222a, TAPE = 0xf4f2ea;
  // objetos de jefe (variantes de una pieza base con la MISMA geometría: color por vértice o atlas; VB.Look cae a «as» sin dibujo):
  // cañón (muñequera negra con aro de cA), hierro (esparadrapo gris acero con remaches), martillo (manguito oscuro con un mazo de cA)
  // y pulpo (rodilleras altas moradas / tobillera de cA, con ventosas)
  var STEEL = 0x9aa6b4, STEEL_DK = 0x4f5866, MAZO_DK = 0x2b2833, PULPO = 0x9a4fc4, PULPO_HI = 0xf0c8ff;
  var KNEE_HI = { altas: 1, rodiPulpo: 1 }, TAPED = { dedos: TAPE, dedosMuro: STEEL };
  function slotVal(v, slot, bch) {
    var d = (bch ? SLOT_DEF.beach : SLOT_DEF.hall)[slot] || '', ven;
    if (v === '' && !(slot === 'shoes' && !bch)) return '';      // '' = nada (en pista las zapatillas no se quitan)
    if (typeof v !== 'string' || !ITEMS[slot][v]) return d;      // sin dato o id desconocido: lo de hoy
    ven = ITEMS[slot][v];
    if (VENUE_STRICT[slot] && ven !== 'A' && (ven === 'Y') !== bch) return d;
    return v;
  }
  function colOr(v) { return typeof v === 'number' && v >= 0 ? v : -1; }
  function hairOf(h) {
    if (typeof h === 'number') return h;
    try { var it = typeof h === 'string' && VB.Look && VB.Look.item ? VB.Look.item(h) : null; if (it && typeof it.hex === 'number') return it.hex; } catch (e) { }
    return 0x3a2416;
  }
  /** Aspecto NORMALIZADO para dibujar: acepta la L del Vestuario (§2.2, VB.Look.resolve) y las viejas {skin, hair, style, acc}.
   *  Un campo que no llega vale lo de hoy; `acc: 'gafas'` (NPC de playa) = gafas en la frente sin gorro; en playa `paint`
   *  sin definir = zinc. Los colores quedan en hex o -1 (= automático: lo resuelve cada pieza). */
  function normLook(L, bch) {
    L = L || {};
    var acc = L.acc != null ? L.acc : L.head, X = { skin: typeof L.skin === 'number' ? L.skin : 0xdba27a, hair: hairOf(L.hair) };
    X.style = typeof L.style === 'string' && ITEMS.style[L.style] ? L.style : 'tupe';
    for (var i = 0; i < LOOK_SLOTS.length; i++) { var s = LOOK_SLOTS[i]; X[s] = s === 'head' ? '' : slotVal(L[s], s, bch); }
    if (acc === 'gafas') { X.head = ''; if (L.eyes == null) X.eyes = 'frente'; }
    else X.head = typeof acc === 'string' && ITEMS.head[acc] ? acc : '';
    X.cA = colOr(L.cA); X.cB = colOr(L.cB); X.cSock = colOr(L.cSock); X.cShoe = colOr(L.cShoe); X.cGlass = colOr(L.cGlass); X.cPad = colOr(L.cPad);
    // 1.16 (WP1 del plan del Vestuario): segundo color de pelo (hex o -1 = sin él) y efecto de pelo ('' = nada). Aún no los dibuja nadie
    X.hair2 = L.hair2 == null || L.hair2 === '' || L.hair2 === -1 ? -1 : hairOf(L.hair2);
    X.hairFx = typeof L.hairFx === 'string' && ITEMS.hairFx[L.hairFx] ? L.hairFx : '';
    X.beach = !!bch;
    return X;
  }
  // colores automáticos (-1): los de hoy (acento del equipo, oscuro del equipo, calcetín del acento)
  function colA(X, tc) { return X.cA >= 0 ? X.cA : tc.accent; }
  function colB(X, tc) { return X.cB >= 0 ? X.cB : tc.dark; }
  function colSock(X, tc) { return X.cSock >= 0 ? X.cSock : tc.accent; }
  var TC_GEO = ['base', 'accent', 'dark', 'shorts', 'pad', 'sole'], TC_ATLAS = ['base', 'accent', 'dark', 'trim', 'shorts', 'pad', 'numFill', 'pattern', 'libero', 'bib'];
  var TIES = { coleta: 1, mono: 1, trenzas: 1, dosmonos: 1, coletas: 1 };   // peinados con gomas de cA
  function armVc(a) { return ARMS[a] && a !== 'kinesio' && a !== 'manguitoOro' && a !== 'manguitoLlamas' && a !== 'manguitoMazo'; }   // manguito con la bola del codo de cA
  /** Firma de lo que cambia la MALLA (geometría y colores por vértice) de un muñeco con el aspecto L, la equipación tc y la sede.
   *  Un color entra solo si alguna pieza lo lleva por vértice (si no, cambiarlo es solo repintar el atlas). */
  // (justa: lo que no toca la malla —kinesio y malla corta, que van pintados— no entra, así que cambiarlos solo repinta el atlas; si una
  //  pieza pasa a la malla, lookSelfTest lo pilla: «geoSig no ve el cambio de malla». cPad entrará cuando alguna pieza lo lleve por
  //  vértice, y su ficha de look.js con vc 'P')
  function armSig(a) { return a === 'kinesio' ? '' : a; }
  function geoSig(L, tc, bch) {
    var X = normLook(L, bch), p = [bch ? 'Y' : 'P', X.skin, X.hair, X.hair2, X.hairFx, X.style, X.head, X.eyes, X.neck, X.under, armSig(X.armL),
      armSig(X.armR), X.elbows, X.wristL, X.wristR, X.hands, X.legs === 'mallaLarga' ? X.legs : '', X.knees, X.ankle, X.shoes];
    var uA = !!(X.head || TIES[X.style] || armVc(X.armL) || armVc(X.armR) || X.elbows || X.wristL || X.wristR || X.hands === 'mitones' ||
      X.neck === 'medalla' || (bch && (X.ankle === 'tela' || X.ankle === 'pulseraTob' || X.ankle === 'tobiPulpo')));
    var uB = !!(HIDE_HAIR[X.head] || X.head === 'visera' || X.head === 'cinta' || (!bch && X.under === 'termica') || (bch && X.under === 'licra') ||
      (X.legs === 'mallaLarga' && X.knees !== 'cortas' && !KNEE_HI[X.knees]));
    p.push(uA ? X.cA : '', uB ? X.cB : '', bch && X.ankle === 'escarpines' ? X.cSock : '', !bch && (X.shoes === 'clasicas' || X.shoes === 'neon') ? X.cShoe : '', X.eyes ? X.cGlass : '');
    for (var i = 0; i < TC_GEO.length; i++) p.push(tc ? tc[TC_GEO[i]] : '');
    return p.join('|');
  }
  /** Firma de lo que se pinta en el ATLAS (ropa, dorsal, tiras, cara). */
  function atlasSig(L, tc, num, bch) {
    var X = normLook(L, bch), p = [bch ? 'Y' : 'P', num, X.skin, X.hair, X.eyes, X.paint, X.marks, X.beard, X.under, X.band, X.armL, X.armR,
      X.legs, X.knees, X.socks, X.ankle, X.cA, X.cB, X.cSock, X.cGlass, X.cPad];
    for (var i = 0; i < TC_ATLAS.length; i++) p.push(tc ? tc[TC_ATLAS[i]] : '');
    return p.join('|');
  }

  // =====================================================================
  //  GEOMETRÍA: acumulador (una malla con piel rígida por hueso, color por vértice, UV del atlas, peso de tinta `ow`)
  // =====================================================================
  // Modos de UV: 'flat' (texel blanco: color por vértice) · 'wrap' (tronco: u alrededor, v por la altura de reposo entre
  // yBot..yTop sobre las filas r0..r1 del atlas) · 'strip' (tubos: v de la primitiva sobre las filas r0..r1) · 'own' (UV propia).
  // El atlas se DISEÑA en 512 unidades (filas y celdas de abajo) pero se pinta a 1024² (PXK = 2): la cara es enorme y con 512 se veía
  // blanda en primer plano. Las UV se calculan en unidades de diseño (ATLAS = 512) y el lienzo lleva la escala.
  // PXK lo fija cada material (VB.Doll.material: 2 en el 2v2 en alta, 1 con 12 muñecos o en media/baja: 1 MB por atlas en vez de 4)
  var ATLAS = 512, PXK = 2, WHITE_V = 1 - 203.5 / ATLAS;
  // Columnas de las tiras (spec §4.1): cada tubo lee su columna con la u propia del tubo; gu = 0,5 mira hacia FUERA (el tubo se gira
  // TUBE_RY: el izquierdo hacia +X, el derecho hacia −X) y la costura queda por dentro. La columna del lado izquierdo va espejada
  // (su0 > su1): un dibujo asimétrico (llamas, kinesio) sale en espejo en los dos brazos, y lo que se lee (la «C» del brazalete) se
  // pinta volteado en la columna izquierda para que se lea bien desde fuera. [k] = 0 izquierdo, 1 derecho.
  var SU_ALL = [0, 1], COL_UP = [[0.25, 0], [0.25, 0.5]], COL_FORE = [[0.75, 0.5], [0.75, 1]], COL_TH = [[0.5, 0], [0.5, 1]], COL_SHN = [[0.5, 0], [0.5, 1]];
  var TUBE_RY = [-PI / 2, PI / 2];
  function Geo() { this.p = []; this.n = []; this.c = []; this.u = []; this.si = []; this.sw = []; this.i = []; this.o = []; this.k = 0; this.pre = null; this.bone = 0; this.bone2 = -1; this.w2 = null; this.owk = 1; this.mode = 'flat'; this.rows = null; this.yr = null; this.su = SU_ALL; this.vc = null; }
  Geo.prototype.add = function (geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
    if (this.vc && geo.index) { var g0 = geo; geo = g0.toNonIndexed(); g0.dispose(); }   // dibujo por cara: vértices propios, mismos triángulos
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    q.setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), q, new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    var m0 = this.w2 ? m.clone() : null;
    if (this.pre) m.premultiply(this.pre);
    nm.getNormalMatrix(m);
    var P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, col = new THREE.Color(hex == null ? 0xffffff : hex), i;
    // G.vc(cx, cy, cz): centro del triángulo en coordenadas de la primitiva → hex, o null (= hex). Dibujo por cara (bordes nítidos)
    var vc = this.vc, c0 = vc ? col.clone() : null, vh;
    for (i = 0; i < P.count; i++) {
      if (vc && i % 3 === 0) {
        vh = vc((P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3);
        if (vh == null) col.copy(c0); else col.setHex(vh);
      }
      var w2 = 0; if (m0) { v.fromBufferAttribute(P, i).applyMatrix4(m0); w2 = this.w2(v.y); }
      var gv = U ? U.getY(i) : 0, gu = U ? U.getX(i) : 0;
      v.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      if (this.mode === 'wrap') { var t = clamp((v.y - this.yr[0]) / (this.yr[1] - this.yr[0]), 0, 1); this.u.push(gu, 1 - (this.rows[1] - (this.rows[1] - this.rows[0]) * t) / ATLAS); }
      else if (this.mode === 'strip') {   // u propia del tubo dentro de su columna [su0, su1] (espejada si su0 > su1), con margen contra los mipmaps
        var tv = clamp(gv, 0.03, 0.97), a0 = this.su[0], a1 = this.su[1], mg = a1 > a0 ? 0.006 : -0.006;
        this.u.push(a0 + mg + gu * (a1 - a0 - 2 * mg), 1 - (this.rows[1] - (this.rows[1] - this.rows[0]) * tv) / ATLAS);
      }
      else if (this.mode === 'own') this.u.push(gu, gv);
      else this.u.push(0.5, WHITE_V);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
      this.c.push(col.r, col.g, col.b); this.o.push(this.owk);
      if (w2 > 0) { this.si.push(this.bone, this.bone2, 0, 0); this.sw.push(1 - w2, w2, 0, 0); }
      else { this.si.push(this.bone, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    }
    if (geo.index) for (i = 0; i < geo.index.count; i++) this.i.push(geo.index.getX(i) + this.k);
    else for (i = 0; i < P.count; i++) this.i.push(this.k + i);
    this.k += P.count; geo.dispose(); return this;
  };
  Geo.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(this.sw), 4));
    g.setAttribute('ow', new THREE.Float32BufferAttribute(this.o, 1));
    g.setIndex(this.i);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0.2), 2.4);   // la piel no recalcula límites (salto, brazos arriba)
    return g;
  };

  // ---------- Primitivas con nivel de detalle ----------
  var LOD_K = [0.45, 0.65, 1], LODK = 1, LODR = 2;
  function sg(n, mn) { return Math.max(mn || 3, Math.round(n * LODK)); }
  function V2(x, y) { return new THREE.Vector2(x, y); }
  function sph(r, w, h, ps, pl, ts, tl) { return new THREE.SphereGeometry(r, sg(w || 16, 8), sg(h || 12, 5), ps || 0, pl == null ? PI * 2 : pl, ts || 0, tl == null ? PI : tl); }
  function cyl(rt, rb, h, seg, open) { return new THREE.CylinderGeometry(rt, rb, h, sg(seg || 16, 8), 1, !!open); }
  function torus(r, t, rs, ts) { return new THREE.TorusGeometry(r, t, sg(rs, 4), sg(ts, 10)); }
  // (un perfil que BAJA —cola de la coleta, trenzas, coletas— daba normales y caras hacia dentro: se veía el casco de la tinta en vez del
  //  pelo; se recorre siempre de abajo arriba: mismos triángulos)
  function lathe(pts, seg, mn) { if (pts.length > 1 && pts[pts.length - 1].y < pts[0].y) pts = pts.slice().reverse(); return new THREE.LatheGeometry(pts, sg(seg, mn || 8), 0, PI * 2); }
  function capsule(r, len, cs, rs) { return new THREE.CapsuleGeometry(r, len, Math.max(1, Math.round((cs || 3) * LODK)), sg(rs || 10, 5)); }
  /** Tubo de grosor uniforme que cuelga del origen hasta -len (v = 1 en el arranque, 0 en la punta). */
  function tube(r, len, seg) { return cyl(r, r, len, seg || 16, true); }

  // ---------- Cabeza: esfera deformada de cómic (cráneo grande, mejillas, mandíbula marcada y mentón) ----------
  // (x, y, z) dirección sobre la esfera unidad → punto en metros del hueso de la cabeza (centro en HEAD_C)
  function headShape(x, y, z, o) {
    var lo = y < 0 ? -y : 0, hi = y > 0 ? y : 0, fr = z > 0 ? z : 0;
    var jaw = Math.exp(-(y + 0.45) * (y + 0.45) / 0.03);                   // anillo de la mandíbula (ángulo marcado bajo las orejas)
    var X = x * HEAD_RX * (1 - 0.3 * lo * lo * lo) * (1 + 0.035 * hi) * (1 + 0.1 * jaw * (0.5 + 0.5 * fr));
    var Y = y * HEAD_RY * (y < 0 ? 0.95 : 1);
    var Z = z * HEAD_RZ * (z < 0 ? (1 - 0.12 * lo * lo) : (1 + 0.02 * hi)) * (1 + 0.05 * jaw * fr);
    Z += 0.04 * lo * lo * fr * fr;                                             // mentón que asoma
    Z -= 0.012 * fr * fr * fr * hi * hi;                                       // frente algo plana
    o.x = X; o.y = HEAD_C + Y; o.z = Z; return o;
  }
  var HS = null;
  /** Esfera deformada por headShape con normales calculadas sobre la forma. */
  function headSphere(w, h) {
    if (!HS) HS = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    var geo = new THREE.SphereGeometry(1, w, h), P = geo.attributes.position, N = geo.attributes.normal, d = HS[0], t1 = HS[1], t2 = HS[2], p0 = HS[3], p1 = HS[4], p2 = HS[5], q = HS[6], e = 0.002;
    for (var i = 0; i < P.count; i++) {
      d.fromBufferAttribute(P, i).normalize();
      t1.set(0, 1, 0); if (Math.abs(d.y) > 0.95) t1.set(1, 0, 0);
      t1.cross(d).normalize(); t2.crossVectors(d, t1).normalize();
      headShape(d.x, d.y, d.z, p0);
      q.copy(d).addScaledVector(t1, e).normalize(); headShape(q.x, q.y, q.z, p1);
      q.copy(d).addScaledVector(t2, e).normalize(); headShape(q.x, q.y, q.z, p2);
      p1.sub(p0); p2.sub(p0); q.crossVectors(p1, p2).normalize();
      if (q.dot(d) < 0) q.multiplyScalar(-1);
      P.setXYZ(i, p0.x, p0.y, p0.z); N.setXYZ(i, q.x, q.y, q.z);
    }
    return geo;
  }
  /** Lámina pegada a la cara (rejilla nx × ny sobre headShape, dirección dx ∈ ±dxM, dy ∈ [dy0, dy1]) a F_OFF por fuera,
   *  con UV en la celda 0 de su hoja (x0, y0, w, h en píxeles del atlas). */
  var F_OFF = 0.002, F_PAD = 3;
  function faceSheet(nx, ny, dxM, dy0, dy1, x0, y0, w, h) {
    var geo = new THREE.BufferGeometry(), pos = [], nrm = [], uv = [], idx = [], i, j;
    var d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3(), p0 = {}, p1 = {}, p2 = {}, e = 0.002;
    var P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
    for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) {
      var dx = -dxM + 2 * dxM * i / nx, dy = dy0 + (dy1 - dy0) * j / ny;
      d.set(dx, dy, Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy))).normalize();
      t1.set(0, 1, 0).cross(d).normalize(); t2.crossVectors(d, t1).normalize();
      headShape(d.x, d.y, d.z, p0); P0.set(p0.x, p0.y, p0.z);
      q.copy(d).addScaledVector(t1, e).normalize(); headShape(q.x, q.y, q.z, p1); P1.set(p1.x, p1.y, p1.z).sub(P0);
      q.copy(d).addScaledVector(t2, e).normalize(); headShape(q.x, q.y, q.z, p2); P2.set(p2.x, p2.y, p2.z).sub(P0);
      q.crossVectors(P1, P2).normalize(); if (q.dot(d) < 0) q.multiplyScalar(-1);
      P0.addScaledVector(q, F_OFF);
      pos.push(P0.x, P0.y, P0.z); nrm.push(q.x, q.y, q.z);
      uv.push((x0 + F_PAD + (w - 2 * F_PAD) * i / nx) / ATLAS, 1 - (y0 + F_PAD + (h - 2 * F_PAD) * (1 - j / ny)) / ATLAS);
    }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { var a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, dd = c + 1; idx.push(a, b, dd, a, dd, c); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }
  /** Z de la superficie delantera de la cabeza en (x, y) del hueso. */
  function headFrontZ(x, y) {
    var dx = x / HEAD_RX, dy = (y - HEAD_C) / HEAD_RY, o = { x: 0, y: 0, z: 0 };
    for (var it = 0; it < 30; it++) {
      var dz = Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy));
      headShape(dx, dy, dz, o);
      dx += (x - o.x) / HEAD_RX * 0.8; dy += (y - o.y) / HEAD_RY * 0.8;
    }
    return o.z;
  }

  // =====================================================================
  //  ATLAS (512²): tronco con la ropa pintada, tiras de brazo/muslo/espinilla, texel blanco y HOJA DE CARAS
  // =====================================================================
  // Filas: 0-199 tronco (u alrededor: 0 delante, 0,25 izquierda, 0,5 espalda; v = altura; camiseta arriba, pantalón abajo)
  //        200-207 blanco · 208-247 brazo (manga → piel) · 250-289 muslo (pantalón → piel) · 292-331 espinilla (piel → calcetín)
  //        336-455 ojos+cejas: 8 celdas de 128×60 (4×2) · 456-511 bocas: 8 celdas de 64×56
  var TR_R = [0, 199], TR_SPLIT = 142, ARM_R = [208, 247], TH_R = [250, 289], SHN_R = [292, 331];
  var FE_W = 128, FE_H = 60, FE_Y = 336, FM_W = 64, FM_H = 56, FM_Y = 456;
  // alturas de reposo del tronco (espacio del cuerpo) que cubren las filas TR_R: del bajo del pantalón al domo de los hombros
  // (TR_Y0 / TR_Y1 los pone applyDims)
  // direcciones de las láminas de la cara (sobre la esfera unidad) y geometría de los rasgos (metros del hueso de la cabeza)
  var FE_DX = 0.8, FE_DY0 = -0.36, FE_DY1 = 0.64, FM_DX = 0.56, FM_DY0 = -0.92, FM_DY1 = -0.3;
  // rasgos en metros de la cabeza de v1 (centro HEAD_C0): faceCell los escala ×FK alrededor del centro de la cabeza activa
  var EYE_X = 0.078, EYE_Y = HEAD_C0 + 0.005, EYE_RX = 0.046, EYE_RY = 0.06, BROW_Y = HEAD_C0 + 0.095, MOUTH_Y = HEAD_C0 - 0.1;
  var NUM_FONT = '"Barlow Condensed","Arial Narrow","Arial Black",Impact,sans-serif';

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texOf(cv) { var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; return t; }

  /** Atlas entero del jugador: tronco con la ropa, tiras de las extremidades, blanco y hoja de caras. num = dorsal; beach = playa. */
  function paintAtlas(cv, tc, L, num, beach) {
    var g = cv.getContext('2d'), px = cv.width / ATLAS;
    PXK = px;
    g.setTransform(px, 0, 0, px, 0, 0);   // unidades de diseño (512) → píxeles del lienzo (512·PXK)
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS, ATLAS);
    var X = normLook(L, !!beach);
    paintBody(g, tc, X, num == null ? L.num : num, !!beach);
    paintLimbs(g, tc, X, !!beach);
    paintFace(g, tc, X, !!beach);
  }
  /** Banda del «tajo» en zigzag con filo oscuro de (x0,y0) a (x1,y1), ancho w. */
  function tajoBand(g, x0, y0, x1, y1, w, fill, edge) {
    var dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy), nx = -dy / l, ny = dx / l;
    function band(hw, zz) {
      var n = Math.max(2, Math.round(l / 16)), i, t, o, pts = [];
      for (i = 0; i <= n; i++) { t = i / n; o = hw + (i % 2 ? zz : -zz); pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]); }
      for (i = n; i >= 0; i--) { t = i / n; o = -hw + (i % 2 ? -zz : zz); pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]); }
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill();
    }
    g.fillStyle = hexCss(edge); band(w / 2 + 6, 6);
    g.fillStyle = hexCss(fill); band(w / 2, 6);
  }
  /** Tronco: camiseta (filas 0..TR_SPLIT) con el tajo del hombro izquierdo a la cadera derecha, dorsal grande en la espalda y
   *  pequeño en el pecho; pantalón (TR_SPLIT..199) con cinturilla y paneles del acento. */
  //  Diseños (tc.pattern, Ajustes · Equipación): 'diag' = el tajo (por defecto), 'liso', 'franjas' (dos bandas), 'rayas' (verticales);
  //  el líbero (tc.libero) va liso. Playa: camiseta de TIRANTES (hombros y sisas de piel, espalda nadadora, cuello redondo con ribete)
  //  con el tajo bajo el dorsal grande del pecho, y malla corta del color de la camiseta con panel del acento.
  //  Vestuario: con la licra de surf (playa) la piel de los hombros, las sisas, el escote y la espalda pasa a cB (tirantes y dorsal encima).
  //  'peto' (partidillo y ejercicios de la Carrera, players.js scrimKits): sobre la camiseta de entreno (tc.base) un peto tc.bib con
  //  paneles delante y detrás unidos por los hombros, los COSTADOS ABIERTOS (u ≈ 0,25 y 0,75: se ve la camiseta) y el bajo algo más
  //  corto que la camiseta, todo con filo de tinta para que se lea en cartoon; escote redondo con ribete tc.dark y dorsal grande
  //  (tc.numFill) delante y detrás. En la playa el peto va sobre la camiseta de tirantes (tirantes del peto, sisas y escote de piel).
  //  El líbero lleva también el peto (players.js kitOf). Solo atlas: ni malla nueva ni dibujos.
  function paintBody(g, tc, L, numV, beach) {
    var W = ATLAS, S = TR_SPLIT, sk = hexCss(beach && L.under === 'licra' ? colB(L, tc) : L.skin), pat = tc.pattern === 'peto' && tc.bib != null ? 'peto' : tc.libero ? 'liso' : (tc.pattern || 'diag');
    var bibEd = pat === 'peto' ? mixHex(tc.bib, INK, 0.55) : 0;
    g.save(); g.beginPath(); g.rect(0, TR_R[0], W, TR_R[1] - TR_R[0] + 1); g.clip();
    g.fillStyle = hexCss(tc.base); g.fillRect(0, 0, W, S);
    function wrap(fn) { fn(0); fn(W); fn(-W); }
    /** peto: todo el contorno en tc.bib desde la fila y0 hasta un poco antes del bajo, con filo de tinta abajo y los dos costados
     *  abiertos desde yo (hueco de ±0,04 de u con la camiseta y filo en los bordes) */
    function peto(y0, yo) {
      var y1 = S - 16, gw = 0.04 * W;
      g.fillStyle = hexCss(bibEd); g.fillRect(0, y0, W, y1 - y0 + 4);
      g.fillStyle = hexCss(tc.bib); g.fillRect(0, y0, W, y1 - y0);
      [0.25, 0.75].forEach(function (u) {
        var cx = u * W;
        function slot(hw) { g.beginPath(); g.moveTo(cx - hw, S + 2); g.lineTo(cx - hw, yo + hw); g.quadraticCurveTo(cx - hw, yo - hw * 0.2, cx, yo - hw * 0.2); g.quadraticCurveTo(cx + hw, yo - hw * 0.2, cx + hw, yo + hw); g.lineTo(cx + hw, S + 2); g.closePath(); g.fill(); }
        g.fillStyle = hexCss(bibEd); slot(gw + 4);
        g.fillStyle = hexCss(tc.base); slot(gw);
      });
    }
    if (beach) {
      // tajo bajo el dorsal del pecho (del centro a la cadera derecha); con peto, el peto entero (sisas y escote se recortan encima)
      if (pat === 'peto') peto(0, 52);
      else wrap(function (o) { tajoBand(g, o + 70, 72, o - 96, S + 10, 44, tajoFill(tc), tc.dark); });
      // hombros desnudos: las filas altas son piel salvo los dos tirantes (sobre los hombros, u ≈ 0,25 y 0,75)
      g.fillStyle = sk; g.fillRect(0, -2, W, 24);
      // sisas (piel) en los lados, más abiertas hacia la espalda (nadadora); escote delante y espalda baja
      var rib = hexCss(pat === 'peto' ? tc.dark : tc.accent);   // ribete de sisas y escote (con peto, oscuro: el filo del peto)
      [0.25, 0.75].forEach(function (u) { var cx = u * W; g.fillStyle = rib; g.beginPath(); g.ellipse(cx + (u < 0.5 ? 1 : -1) * 0, 8, 50, 46, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(cx, 6, 44, 40, 0, 0, PI * 2); g.fill(); });
      g.fillStyle = rib; g.beginPath(); g.ellipse(W / 2, 0, 50, 34, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(W / 2, -2, 44, 28, 0, 0, PI * 2); g.fill();   // espalda
      wrap(function (o) { g.fillStyle = rib; g.beginPath(); g.ellipse(o, 0, 60, 30, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(o, -3, 53, 24, 0, 0, PI * 2); g.fill(); });   // escote
      // tirantes del color de la camiseta sobre cada hombro (de la sisa al escote y a la espalda); con peto, los del peto
      g.fillStyle = hexCss(pat === 'peto' ? tc.bib : tc.base); [0.25, 0.75].forEach(function (u) { var cx = u * W; g.fillRect(cx - 86, -2, 34, 40); g.fillRect(cx + 52, -2, 34, 40); });
    } else if (pat === 'peto') {
      peto(0, 30);
    } else if (pat === 'diag') {
      // tajo: del hombro izquierdo (u ≈ 0,18, arriba) a la cadera derecha (u ≈ -0,2, bajo de la camiseta), pasando por el pecho
      wrap(function (o) { tajoBand(g, o + 92, -10, o - 104, S + 10, 60, tajoFill(tc), tc.dark); });
    } else if (pat === 'franjas') {
      g.fillStyle = hexCss(tc.accent); g.globalAlpha = 0.92; g.fillRect(0, 78, W, 14); g.fillRect(0, 98, W, 7); g.globalAlpha = 1;
    } else if (pat === 'rayas') {
      g.fillStyle = hexCss(tc.accent); g.globalAlpha = 0.55; for (var rx = 8; rx < W; rx += 32) g.fillRect(rx, 18, 9, S - 28); g.globalAlpha = 1;
    }
    if (!beach) {
      // cuello redondo (ribete) y hombros: canesú oscuro ligero en la espalda
      if (pat !== 'peto') { g.fillStyle = hexCss(tc.dark); g.globalAlpha = 0.3; g.fillRect(170, 0, 172, 16); g.globalAlpha = 1; }
      wrap(function (o) { g.fillStyle = hexCss(pat === 'peto' ? tc.dark : tc.trim); g.beginPath(); g.ellipse(o, 0, 62, 20, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(o, -3, 54, 15, 0, 0, PI * 2); g.fill(); });
    }
    // dorsales: grande en la espalda (u 0,5), pequeño en el pecho dentro del tajo (oscuro); playa: grande también delante
    var s = String(numV == null ? 0 : numV);
    function num(cx, cy, h, sx, dark) {
      g.save(); g.translate(cx, cy); g.scale(sx, 1); g.font = 'italic 900 ' + h + 'px ' + NUM_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (dark) { g.fillStyle = hexCss(tc.dark); g.fillText(s, 0, 0); }
      else { g.lineWidth = h * 0.12; g.strokeStyle = hexCss(pat === 'peto' ? bibEd : tc.dark); g.strokeText(s, 0, 0); g.fillStyle = tc.numFill || '#ffffff'; g.fillText(s, 0, 0); }
      g.restore();
    }
    if (pat === 'peto') {   // peto: dorsal grande detrás y mediano delante, los dos en el color del dorsal del peto
      num(W / 2, beach ? 76 : 70, beach ? 84 : 100, 1.0, false);
      wrap(function (o) { num(o, beach ? 68 : 66, beach ? 52 : 58, 1.2, false); });
    } else {
      num(W / 2, beach ? 70 : 62, beach ? 76 : 92, 1.0, false);
      if (beach) wrap(function (o) { num(o, 52, 56, 1.2, false); });
      else wrap(function (o) { num(o, 58, 44, 1.25, pat === 'diag'); });
    }
    // bajo de la camiseta (ribete fino) y pantalón (playa: malla corta del color de la camiseta)
    g.fillStyle = hexCss(beach ? tc.base : tc.shorts); g.fillRect(0, S, W, TR_R[1] - S + 1);
    g.fillStyle = hexCss(tc.accent); g.fillRect(0, S, W, 5);                                   // cinturilla
    g.fillStyle = hexCss(tc.dark); g.globalAlpha = 0.5; g.fillRect(0, S - 4, W, 4); g.globalAlpha = 1;   // ribete del bajo
    [0.25, 0.75].forEach(function (u) {                                                          // paneles laterales del acento
      var cx = u * W; g.fillStyle = hexCss(tc.accent); g.beginPath(); g.moveTo(cx - 14, S + 5); g.lineTo(cx + 14, S + 5); g.lineTo(cx + 22, TR_R[1] + 1); g.lineTo(cx - 22, TR_R[1] + 1); g.fill();
    });
    g.restore();
  }
  /** Tiras de las extremidades POR COLUMNA (spec §4.1): v = 1 (arranque, fila r0) → v = 0 (punta, fila r1); cada tubo lee su columna
   *  (COL_UP / COL_FORE / COL_TH / COL_SHN; la izquierda espejada). Con el aspecto de hoy el resultado es el de siempre: manga corta
   *  con ribete → piel, antebrazo de piel, pernera con ribete → piel, piel → calcetín del acento con franja; playa: brazos y espinillas
   *  de piel y malla corta. Encima, por capas: interior (térmica / licra), manguitos, brazalete, mallas, calcetines, rodilleras y
   *  escarpines. Tramos [fracción desde el arranque, color]: el mismo redondeo que las tiras de siempre. */
  function paintLimbs(g, tc, X, beach) {
    var W = ATLAS, sk = X.skin, cA = colA(X, tc), cB = colB(X, tc), cS = colSock(X, tc), k, c;
    function col(r, su) { return { r: r, x0: Math.min(su[0], su[1]) * W, x1: Math.max(su[0], su[1]) * W, flip: su[0] > su[1] }; }
    function rowOf(c, f) { return c.r[0] + Math.round((c.r[1] - c.r[0] + 1) * f); }
    function band(c, f0, f1, hex) { var h = c.r[1] - c.r[0] + 1; g.fillStyle = hexCss(hex); g.fillRect(c.x0, c.r[0] + Math.round(h * f0), c.x1 - c.x0, Math.ceil(h * (f1 - f0)) + 1); }
    function segs(c, s) { for (var i = 0; i < s.length; i++) band(c, s[i][0], s[i + 1] ? s[i + 1][0] : 1, s[i][1]); }
    /** dibujo libre recortado a la columna entre las fracciones f0..f1: fn(xc, y0, y1, ax, w) en unidades de diseño; ax = unidades
     *  de u por fila a escala real del tubo (radio tr, largo len), para que las formas no salgan aplastadas */
    function draw(c, f0, f1, tr, len, fn) {
      var y0 = rowOf(c, f0), y1 = rowOf(c, f1) + 1, rows = c.r[1] - c.r[0] + 1, ax = ((c.x1 - c.x0) / (2 * PI * tr)) / (rows / len);
      g.save(); g.beginPath(); g.rect(c.x0, y0, c.x1 - c.x0, y1 - y0); g.clip();
      fn((c.x0 + c.x1) / 2, y0, y1, ax, c.x1 - c.x0);
      g.restore();
    }
    // ---- manguitos: cuerpo entre f0 y f1 de una columna (las llamas suben desde abajo: el codo en el brazo, la muñeca en el antebrazo)
    function sleeveFill(c, f0, f1, id, tr, len) {
      if (f1 <= f0) return;
      if (id === 'manguito') { band(c, f0, f1, cA); return; }
      if (id === 'manguitoOro') {      // dorado con dos franjas de brillo hacia fuera
        band(c, f0, f1, GOLD);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) { g.fillStyle = hexCss(GOLD_HI); g.fillRect(xc - w * 0.1, y0, w * 0.035, y1 - y0); g.fillRect(xc + w * 0.05, y0, w * 0.02, y1 - y0); });
        return;
      }
      if (id === 'manguitoRayas') { band(c, f0, f1, cA); for (var f = f0 + 0.05; f < f1 - 0.02; f += 0.1) band(c, f, Math.min(f1, f + 0.05), cB); return; }
      if (id === 'manguitoCuadros') {  // damero de 4 casillas alrededor y casillas cuadradas a lo largo (u propia del tubo)
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var sw = w / 4, sh = Math.max(3, sw / ax), j = 0, y, i;
          for (y = y0; y < y1; y += sh, j++) for (i = 0; i < 4; i++) { g.fillStyle = hexCss((i + j) % 2 ? cB : cA); g.fillRect(c.x0 + i * sw, y, sw + 0.5, sh + 0.5); }
        });
        return;
      }
      if (id === 'manguitoLlamas') {   // llamas del acento (con el corazón más claro) sobre el oscuro del equipo
        band(c, f0, f1, tc.dark);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var H = y1 - y0, n = 8, tw = w / n, hs = [0.62, 0.86, 0.5, 0.95, 0.66, 0.8, 0.54, 0.9];
          function tongues(kk, hex) {
            g.fillStyle = hexCss(hex);
            for (var i = -1; i <= n; i++) {
              var x = c.x0 + (i + 0.5) * tw, h = H * hs[(i + n) % n] * kk;
              g.beginPath(); g.moveTo(x - tw * 0.62, y1); g.quadraticCurveTo(x - tw * 0.2, y1 - h * 0.55, x + tw * 0.12, y1 - h);
              g.quadraticCurveTo(x + tw * 0.05, y1 - h * 0.45, x + tw * 0.62, y1); g.closePath(); g.fill();
            }
          }
          tongues(1, cA); tongues(0.5, mixHex(cA, 0xffe27a, 0.6));
        });
        return;
      }
      if (id === 'manguitoRayos') {    // rayos amarillos sobre el acento: uno grande hacia fuera y otro por detrás
        band(c, f0, f1, cA);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var H = y1 - y0, s = H / 10;
          [xc, xc + w / 2 > c.x1 ? xc - w / 2 : xc + w / 2].forEach(function (bx) {
            g.save(); g.translate(bx, y0); g.scale(ax, 1);
            g.fillStyle = hexCss(0xffd23a); g.strokeStyle = hexCss(mixHex(cA, 0x000000, 0.45)); g.lineWidth = 0.35; g.lineJoin = 'miter';
            g.beginPath(); g.moveTo(0.6 * s, 0.4 * s); g.lineTo(2.6 * s, 0.4 * s); g.lineTo(1.0 * s, 4.4 * s); g.lineTo(2.4 * s, 4.4 * s); g.lineTo(-1.6 * s, 9.6 * s);
            g.lineTo(-0.2 * s, 5.6 * s); g.lineTo(-1.6 * s, 5.6 * s); g.closePath(); g.fill(); g.stroke(); g.restore();
          });
        });
        return;
      }
      if (id === 'manguitoMazo') {     // jefe Martillo: oscuro, dos rayas cruzadas por detrás y un mazo de cA hacia fuera
        band(c, f0, f1, MAZO_DK);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          // medidas en u (alrededor) y filas (a lo largo) con la misma escala física (ax = u por fila): el mazo no sale estirado
          var H = y1 - y0, ink = mixHex(cA, 0x000000, 0.55), bx = xc + w / 2 > c.x1 ? xc - w / 2 : xc + w / 2;
          var hw = 0.36 * w, hh = 0.55 * hw / ax, hl = 1.7 * hh, k = Math.min(1, 0.9 * H / (hh + hl)); hw *= k; hh *= k; hl *= k;
          var top = y0 + (H - hh - hl) / 2, mw = hw * 0.24, lw = Math.max(0.5, 0.05 * hh);
          g.strokeStyle = hexCss(mixHex(MAZO_DK, cA, 0.4)); g.lineWidth = 0.1 * w; g.lineCap = 'butt';      // rayas cruzadas (detrás)
          g.beginPath(); g.moveTo(bx - 0.18 * w, y0); g.lineTo(bx + 0.18 * w, y1); g.moveTo(bx + 0.18 * w, y0); g.lineTo(bx - 0.18 * w, y1); g.stroke();
          g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = hexCss(ink);
          g.fillStyle = hexCss(mixHex(cA, 0xffffff, 0.3)); g.beginPath(); g.rect(xc - mw / 2, top + hh * 0.9, mw, hl); g.fill(); g.stroke();   // mango
          g.fillStyle = hexCss(cA); g.beginPath(); g.rect(xc - hw / 2, top, hw, hh); g.fill(); g.stroke();                                  // cabeza
          g.fillStyle = hexCss(mixHex(cA, 0xffffff, 0.55)); g.fillRect(xc - hw / 2 + hw * 0.08, top + hh * 0.14, hw * 0.84, hh * 0.18);    // brillo
        });
      }
    }
    /** ventosas del pulpo: dos filas de círculos claros con el centro hundido, por toda la vuelta del tubo (redondas: u propia) */
    function suckers(c, f0, f1, tr, len) {
      draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
        var H = y1 - y0, n = 5, sw = w / n, r = Math.min(sw * 0.3, H * 0.22 * ax), j, i;
        for (j = 0; j < 2; j++) for (i = -1; i <= n; i++) {
          var x = c.x0 + (i + (j ? 0.5 : 0) + 0.25) * sw, y = y0 + H * (j ? 0.7 : 0.3);
          g.fillStyle = hexCss(PULPO_HI); g.beginPath(); g.ellipse(x, y, r, r / ax, 0, 0, PI * 2); g.fill();
          g.fillStyle = hexCss(mixHex(PULPO, 0x000000, 0.25)); g.beginPath(); g.ellipse(x, y, r * 0.45, r * 0.45 / ax, 0, 0, PI * 2); g.fill();
        }
      });
    }
    function cuff(c, id) { band(c, 0.88, 0.97, id === 'manguitoOro' ? mixHex(GOLD, 0x8a5a10, 0.35) : id === 'manguitoLlamas' || id === 'manguitoMazo' ? cA : cB); }
    // ---- brazos ([k] 0 izquierdo, 1 derecho): f0 = donde acaba la manga (o la licra) y empieza la piel
    for (k = 0; k < 2; k++) {
      var arm = k ? X.armR : X.armL, cu = col(ARM_R, COL_UP[k]), cf = col(ARM_R, COL_FORE[k]), f0 = beach ? 0.14 : 0.46;
      if (beach && X.under === 'licra') { segs(cu, [[0, cB], [0.38, mixHex(cB, 0x000000, 0.25)], [0.44, sk]]); f0 = 0.44; }   // licra: manga corta
      else if (beach) segs(cu, [[0, sk]]);                                                            // brazo desnudo
      else if (X.under === 'termica') segs(cu, [[0, tc.base], [0.38, tc.accent], [0.46, cB]]);         // manga corta → térmica
      else segs(cu, [[0, tc.base], [0.38, tc.accent], [0.46, sk]]);                                   // manga corta con ribete → piel
      if (!beach && X.under === 'termica') segs(cf, [[0, cB], [0.9, mixHex(cB, 0x000000, 0.28)], [0.96, cB]]);   // térmica hasta la muñeca
      else segs(cf, [[0, sk]]);                                                                       // antebrazo de piel
      if (arm === 'kinesio') {         // kinesio: zigzag de cinta del acento por la cara de fuera del brazo, con el borde más oscuro
        draw(cu, f0 + 0.03, 0.97, TUBE_ARM, UPPER, function (xc, y0, y1, ax) {
          var H = y1 - y0, n = 3, i;
          g.save(); g.translate(xc, y0); g.scale(ax, 1); g.lineJoin = 'round'; g.lineCap = 'butt';
          g.beginPath(); for (i = 0; i <= n * 2; i++) g.lineTo((i % 2 ? 1 : -1) * H * 0.16, H * i / (n * 2));
          g.strokeStyle = hexCss(mixHex(cA, 0x000000, 0.3)); g.lineWidth = H * 0.13; g.stroke();
          g.strokeStyle = hexCss(cA); g.lineWidth = H * 0.1; g.stroke(); g.restore();
        });
      } else if (ARMS[arm]) {
        sleeveFill(cu, f0, 1, arm, TUBE_ARM, UPPER);
        sleeveFill(cf, 0, 0.88, arm, TUBE_ARM, FORE); cuff(cf, arm);
      }
      if (k === 0 && X.band === 'capitan') {   // brazalete del acento con filetes y la «C» hacia fuera (volteada: la columna va espejada)
        // (justo por debajo de la bola del hombro y de la manga: más arriba lo tapa la bola, que cubre el ~40 % alto del brazo)
        var b0 = beach ? (X.under === 'licra' ? 0.47 : 0.42) : 0.5;
        band(cu, b0, b0 + 0.15, cA);
        draw(cu, b0, b0 + 0.15, TUBE_ARM, UPPER, function (xc, y0, y1, ax) {
          var H = y1 - y0, e = Math.max(0.6, H * 0.1), ink = lumHex(cA) > 0.55 ? faceInk(tc) : 0xffffff;
          g.fillStyle = hexCss(mixHex(cA, 0x000000, 0.3)); g.fillRect(cu.x0, y0, cu.x1 - cu.x0, e); g.fillRect(cu.x0, y1 - e, cu.x1 - cu.x0, e);
          g.save(); g.translate(xc, (y0 + y1) / 2); g.scale(cu.flip ? -ax : ax, 1);
          g.strokeStyle = hexCss(ink); g.lineWidth = H * 0.2; g.lineCap = 'round';
          g.beginPath(); g.arc(0, 0, H * 0.28, PI * 0.28, PI * 1.72); g.stroke(); g.restore();
        });
      }
    }
    // ---- muslos
    for (k = 0; k < 2; k++) {
      c = col(TH_R, COL_TH[k]);
      var top = beach ? tc.base : tc.shorts, fs = beach ? 0.36 : 0.48;
      segs(c, beach ? [[0, tc.base], [0.3, tc.accent], [0.36, sk]] : [[0, tc.shorts], [0.42, tc.accent], [0.48, sk]]);   // malla corta / pernera → piel
      if (X.legs === 'malla') { band(c, fs, 0.85, top); band(c, 0.82, 0.85, mixHex(top, tc.accent, 0.5)); }          // malla corta hasta casi la rodilla
      else if (X.legs === 'mallaLarga') band(c, fs, 1, cB);
      if (X.knees === 'altas') band(c, 0.82, 1, tc.pad);
      else if (X.knees === 'rodiPulpo') { band(c, 0.8, 1, PULPO); suckers(c, 0.8, 1, TUBE_LEG, THIGH); }
    }
    // ---- espinillas
    for (k = 0; k < 2; k++) {
      c = col(SHN_R, COL_SHN[k]);
      var sc = X.socks === 'desparejados' && k === 1 ? cB : cS, f;
      if (beach || X.socks === '') segs(c, [[0, sk]]);                                                         // sin calcetines
      else if (X.socks === 'tobilleros') segs(c, [[0, sk], [0.9, sc]]);
      else if (X.socks === 'altos') segs(c, [[0, sk], [0.2, sc], [0.3, tc.base], [0.36, sc], [0.42, tc.base], [0.48, sc]]);
      else if (X.socks === 'altosRayas') { segs(c, [[0, sk], [0.2, sc]]); for (f = 0.26; f < 0.95; f += 0.09) band(c, f, f + 0.04, 0xf4f4f4); }
      else segs(c, [[0, sk], [0.66, sc], [0.78, tc.base], [0.86, sc]]);                                         // piel → calcetín con franja
      if (X.legs === 'mallaLarga') {   // la malla larga baja hasta media espinilla; los calcetines altos van por encima
        band(c, 0, 0.4, cB); band(c, 0.37, 0.4, mixHex(cB, 0x000000, 0.3));
        if (!beach && X.socks === 'altos') { band(c, 0.2, 0.4, sc); band(c, 0.3, 0.36, tc.base); }
        else if (!beach && X.socks === 'altosRayas') { band(c, 0.2, 0.4, sc); band(c, 0.26, 0.3, 0xf4f4f4); band(c, 0.35, 0.39, 0xf4f4f4); }
      }
      if (X.knees === 'altas') band(c, 0, 0.22, tc.pad);
      else if (X.knees === 'rodiPulpo') { band(c, 0, 0.24, PULPO); suckers(c, 0, 0.24, TUBE_LEG * 0.96, SHIN); }
      else if (X.knees === 'bajadas') band(c, 0.12, 0.42, tc.pad);
      if (beach && X.ankle === 'escarpines') band(c, 0.85, 1, cS);
    }
  }

  // ---------- HOJA DE CARAS ----------
  // Ojos+cejas (8 celdas): 0 neutra · 1 parpadeo · 2 concentrado (párpado en diagonal, cejas en V) · 3 esfuerzo (apretados > <) ·
  //   4 alegría (^ ^ cerrados de risa) · 5 pena (párpados caídos, cejas hacia arriba por dentro) · 6 sorpresa (redondos enormes,
  //   pupila chica, cejas altas) · 7 grito/rabia (abiertos, cejas en V muy bajas).
  // Bocas (8 celdas): 0 neutra · 1 sonrisa grande con dientes · 2 grito en O · 3 dientes apretados · 4 pena · 5 «o» chica ·
  //   6 sonrisa con lengua · 7 línea tensa (concentración).
  var EXPR = { neutra: [0, 0], concentrado: [2, 7], esfuerzo: [3, 3], grito: [7, 2], alegria: [4, 1], pena: [5, 4], sorpresa: [6, 5], lengua: [4, 6] };
  function faceInk(tc) { return mixHex(tc.dark, INK, 0.55); }
  function faceHalo(L) { var lu = lumHex(L.skin); if (lu >= 0.42) return null; return hexCss(mixHex(L.skin, 0xffe6d2, clamp(0.38 + (0.42 - lu) * 1.6, 0.38, 0.6))); }
  /** Celda: recorte y transformación de metros del hueso de la cabeza (X, Y) a píxeles. */
  function faceCell(g, x0, y0, w, h, dxM, dy0, dy1, fn) {
    var X0 = -dxM * HEAD_RX, X1 = dxM * HEAD_RX, Y0 = HEAD_C + dy0 * HEAD_RY, Y1 = HEAD_C + dy1 * HEAD_RY;
    var a = (w - 2 * F_PAD) / (X1 - X0), d = -(h - 2 * F_PAD) / (Y1 - Y0);
    g.save(); g.beginPath(); g.rect(x0 + 1, y0 + 1, w - 2, h - 2); g.clip();
    g.setTransform(a * PXK, 0, 0, d * PXK, (x0 + F_PAD - a * X0) * PXK, (y0 + F_PAD - d * Y1) * PXK);
    g.translate(0, HEAD_C); g.scale(FK, FK); g.translate(0, -HEAD_C0);   // rasgos de v1 → cabeza activa (ojos y boca en proporción)
    g.lineCap = 'round'; g.lineJoin = 'round';
    fn();
    g.restore();
  }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, PI * 2); }
  function paintFace(g, tc, L, beach) {
    g.save();
    g.fillStyle = hexCss(L.skin); g.fillRect(0, FE_Y - 2, ATLAS, ATLAS - FE_Y + 2);
    var i;
    for (i = 0; i < 8; i++) faceCell(g, (i & 3) * FE_W, FE_Y + (i >> 2) * FE_H, FE_W, FE_H, FE_DX, FE_DY0, FE_DY1, function () { paintEyes(g, i, L, tc, beach); });
    for (i = 0; i < 8; i++) faceCell(g, i * FM_W, FM_Y, FM_W, FM_H, FM_DX, FM_DY0, FM_DY1, function () { paintMouth(g, i, L, tc); });
    g.restore();
  }
  // Pintura de mejilla (Vestuario, spec §4.4): las láminas de ojos (dy −0,36..0,64) y de boca (−0,92..−0,30) se solapan a la misma
  // distancia con fondo de piel; lo que se pinta en esa franja parpadea. Todo lo de mejilla y nariz (zinc, rayas, estrella, pecas,
  // tirita, tira nasal) y las gafas pintadas quedan por encima de CHEEK_DY0 (unidades dy de la lámina); CHEEK_Y es esa altura en el
  // lienzo de faceCell (metros de la cabeza de v1: se deshace la escala FK). En la celda de boca nada pasa de MOUTH_TOP.
  var CHEEK_DY0 = FM_DY1 + 0.03, CHEEK_Y = HEAD_C0 + CHEEK_DY0 * HEAD_RY0, MOUTH_TOP = HEAD_C0 + (FE_DY0 - 0.02) * HEAD_RY0;
  /** Recorte de la pintura de mejilla: por encima de CHEEK_Y y dentro del ancho de la lámina (metros de v1). */
  function cheekClip(g) { g.beginPath(); g.rect(-0.2, CHEEK_Y, 0.4, 0.3); g.clip(); }
  function star(g, x, y, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = rot + i * PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.sin(a) * rr, y + Math.cos(a) * rr); }
    g.closePath();
  }
  /** Pintura de cara (ranura paint), debajo de los ojos: zinc (playa, por defecto), rayas, rayas del equipo y estrella. */
  function paintPaint(g, cell, L, tc) {
    var s, k, p = L.paint;
    if (!p) return;
    g.save(); cheekClip(g); g.lineCap = 'round';
    if (p === 'zinc' || p === 'rayasEq') {   // dos rayas cortas bajo el rabillo del ojo (zinc: acento en neón; equipo: base y acento)
      // (asoman bajo el ojo y suben hacia el rabillo, donde el ojo ya no tapa; nunca por debajo de CHEEK_Y)
      g.lineWidth = 0.0068;
      for (s = -1; s <= 1; s += 2) for (k = 0; k < 2; k++) {
        g.strokeStyle = hexCss(p === 'zinc' ? zincHex(tc) : (k ? tc.accent : tc.base));
        g.beginPath(); g.moveTo(s * (0.08 + k * 0.018), CHEEK_Y + 0.0042 + k * 0.009); g.lineTo(s * (0.158 + k * 0.004), CHEEK_Y + 0.0122 + k * 0.009); g.stroke();
      }
    } else if (p === 'rayas') {            // rayas negras bajo los ojos («eye black»): una gruesa por lado, de la mejilla al rabillo
      g.fillStyle = '#1b1a22';   // fina bajo el ojo y más gruesa hacia el rabillo (lo que el ojo no tapa)
      for (s = -1; s <= 1; s += 2) {
        g.beginPath(); g.moveTo(s * 0.045, CHEEK_Y + 0.009); g.quadraticCurveTo(s * 0.11, CHEEK_Y + 0.013, s * 0.162, CHEEK_Y + 0.031);
        g.lineTo(s * 0.162, CHEEK_Y + 0.012); g.quadraticCurveTo(s * 0.1, CHEEK_Y - 0.002, s * 0.045, CHEEK_Y + 0.003); g.closePath(); g.fill();
      }
    } else if (p === 'estrella') {         // estrella del acento en la mejilla izquierda del muñeco (derecha de la imagen), con contorno
      star(g, 0.139, CHEEK_Y + 0.027, 0.025, 0.2); g.fillStyle = hexCss(colA(L, tc)); g.fill();
      g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.0035; g.lineJoin = 'round'; g.stroke();
    }
    g.restore();
  }
  /** Marcas (ranura marks), debajo de los ojos: pecas en la nariz y las mejillas, tirita en el pómulo y tira nasal en el puente. */
  function paintMarks(g, cell, L, tc) {
    var m = L.marks, s, i;
    if (!m) return;
    g.save(); cheekClip(g);
    if (m === 'pecas') {
      g.fillStyle = hexCss(mixHex(L.skin, 0x6a3418, 0.45));
      var P = [[0.012, 0.012], [0.024, 0.02], [0.006, 0.026], [0.098, 0.006], [0.112, 0.014], [0.128, 0.006], [0.142, 0.016], [0.122, 0.024]];
      for (s = -1; s <= 1; s += 2) for (i = 0; i < P.length; i++) { ell(g, s * P[i][0], CHEEK_Y + P[i][1], 0.0042, 0.0036); g.fill(); }
    } else if (m === 'tirita') {   // tirita en el pómulo derecho del muñeco (izquierda de la imagen), cruzada
      g.save(); g.translate(-0.136, CHEEK_Y + 0.02); g.rotate(-0.55);
      g.fillStyle = '#f0c89a'; g.fillRect(-0.03, -0.0095, 0.06, 0.019);
      g.fillStyle = '#e2b282'; g.fillRect(-0.011, -0.0095, 0.022, 0.019);
      g.fillStyle = 'rgba(120,70,40,0.35)'; for (i = -2; i <= 2; i += 4) { ell(g, i * 0.011, 0.004, 0.0016, 0.0016); g.fill(); ell(g, i * 0.011, -0.004, 0.0016, 0.0016); g.fill(); }
      g.strokeStyle = 'rgba(120,70,40,0.5)'; g.lineWidth = 0.0018; g.strokeRect(-0.03, -0.0095, 0.06, 0.019);
      g.restore();
    } else if (m === 'tiraNasal') {   // tira nasal del acento sobre el puente de la nariz, entre los ojos
      g.fillStyle = hexCss(colA(L, tc)); g.strokeStyle = hexCss(mixHex(colA(L, tc), 0x000000, 0.35)); g.lineWidth = 0.002;
      g.beginPath(); g.moveTo(-0.034, CHEEK_Y + 0.004); g.quadraticCurveTo(0, CHEEK_Y + 0.0145, 0.034, CHEEK_Y + 0.004); g.lineTo(0.034, CHEEK_Y + 0.019);
      g.quadraticCurveTo(0, CHEEK_Y + 0.0295, -0.034, CHEEK_Y + 0.019); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  }
  /** Gafas pintadas (ranura eyes, salvo `frente`, que es de geometría), encima de los ojos y debajo de las cejas: montura de cGlass
   *  y lente con alfa (la pupila se sigue viendo), en las 8 celdas (las expresiones y el parpadeo siguen solos). |x| ≤ 0,165. */
  var GLASS_Y = EYE_Y + 0.009, GLASS_RX = EYE_RX * 1.3, GLASS_RY = GLASS_Y - CHEEK_Y - 0.0045;
  function glassHex(L, tc) {
    if (L.cGlass >= 0) return L.cGlass;
    return L.eyes === 'deporte' || L.eyes === 'frente' ? tc.accent : L.eyes === 'espejo' ? 0xa7adb8 : 0x2a2230;
  }
  function paintGlasses(g, cell, L, tc) {
    var e = L.eyes, s, fr = hexCss(glassHex(L, tc));
    if (!e || e === 'frente') return;
    g.save(); cheekClip(g); g.lineJoin = 'round';
    if (e === 'deporte') {   // envolventes: una sola lente para los dos ojos, azulada, con la montura arriba
      var y0 = CHEEK_Y + 0.004, y1 = GLASS_Y + EYE_RY * 1.08;
      g.beginPath(); g.moveTo(-0.158, y1 - 0.012); g.quadraticCurveTo(0, y1 + 0.012, 0.158, y1 - 0.012); g.lineTo(0.15, y0 + 0.02);
      g.quadraticCurveTo(0.09, y0 - 0.004, 0.03, y0 + 0.012); g.quadraticCurveTo(0, y0 + 0.03, -0.03, y0 + 0.012); g.quadraticCurveTo(-0.09, y0 - 0.004, -0.15, y0 + 0.02); g.closePath();
      g.fillStyle = 'rgba(150,205,255,0.2)'; g.fill();
      g.strokeStyle = fr; g.lineWidth = 0.007; g.stroke();
      g.beginPath(); g.moveTo(-0.158, y1 - 0.012); g.quadraticCurveTo(0, y1 + 0.012, 0.158, y1 - 0.012); g.lineWidth = 0.016; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.006; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-0.12, y1 - 0.028); g.lineTo(-0.085, y1 - 0.06); g.stroke();
      g.restore(); return;
    }
    for (s = -1; s <= 1; s += 2) {
      var cx = s * EYE_X;
      ell(g, cx, GLASS_Y, GLASS_RX, GLASS_RY);
      if (e === 'espejo') {   // espejo: degradado arcoíris con alfa
        var gr = g.createLinearGradient(cx - GLASS_RX, GLASS_Y + GLASS_RY, cx + GLASS_RX, GLASS_Y - GLASS_RY);
        gr.addColorStop(0, 'rgba(255,90,140,0.55)'); gr.addColorStop(0.35, 'rgba(255,200,60,0.55)'); gr.addColorStop(0.65, 'rgba(70,210,160,0.55)'); gr.addColorStop(1, 'rgba(80,120,255,0.55)');
        g.fillStyle = gr;
      } else g.fillStyle = e === 'oscuras' ? 'rgba(26,35,64,0.45)' : 'rgba(225,240,255,0.12)';
      g.fill();
      g.strokeStyle = fr; g.lineWidth = e === 'pasta' ? 0.014 : 0.011; ell(g, cx, GLASS_Y, GLASS_RX, GLASS_RY); g.stroke();
      if (e !== 'pasta') {    // brillo (el espejo, doble)
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.006; g.lineCap = 'round';
        g.beginPath(); g.arc(cx, GLASS_Y, GLASS_RX * 0.62, PI * 0.62, PI * 0.9); g.stroke();
        if (e === 'espejo') { g.beginPath(); g.arc(cx, GLASS_Y, GLASS_RX * 0.62, PI * 1.62, PI * 1.85); g.stroke(); }
      }
    }
    g.strokeStyle = fr; g.lineWidth = e === 'pasta' ? 0.012 : 0.009; g.lineCap = 'round';   // puente y arranque de las patillas
    g.beginPath(); g.moveTo(-EYE_X + GLASS_RX * 0.95, GLASS_Y + 0.012); g.quadraticCurveTo(0, GLASS_Y + 0.022, EYE_X - GLASS_RX * 0.95, GLASS_Y + 0.012); g.stroke();
    for (s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * (EYE_X + GLASS_RX), GLASS_Y + 0.014); g.lineTo(s * 0.166, GLASS_Y + 0.02); g.stroke(); }
    g.restore();
  }
  function paintEyes(g, cell, L, tc, beach) {
    var ink = hexCss(faceInk(tc)), brow = hexCss(mixHex(L.hair, 0x000000, 0.2)), halo = faceHalo(L), s;
    // halo claro de las pieles oscuras, luego pintura y marcas, ojos, gafas pintadas y cejas (en ese orden: la pintura queda bajo los
    // ojos y las gafas bajo las cejas; sin nada de eso, lo de siempre)
    if (halo) for (s = -1; s <= 1; s += 2) { g.fillStyle = halo; ell(g, s * EYE_X, EYE_Y + 0.01, EYE_RX * 1.5, EYE_RY * 1.4); g.fill(); }
    paintPaint(g, cell, L, tc);
    paintMarks(g, cell, L, tc);
    for (s = -1; s <= 1; s += 2) {
      var cx = s * EYE_X, cy = EYE_Y, rx = EYE_RX, ry = EYE_RY, pr = 0.027, py = -0.004, px = 0, lid = 0, tilt = 0, shut = 0;
      if (cell === 6) { rx *= 1.14; ry *= 1.1; pr = 0.016; px = 0; py = 0; }      // sorpresa: enormes, pupila chica
      if (cell === 7) { rx *= 1.05; pr = 0.022; py = 0.004; lid = 0.22; tilt = 0.55; }   // grito: ceja encima del ojo
      if (cell === 2) { lid = 0.42; tilt = 0.5; }                                  // concentrado: párpado en diagonal
      if (cell === 5) { lid = 0.4; tilt = -0.5; py = -0.014; px = s * 0.006; }   // pena: párpado caído, mirada baja
      if (cell === 1 || cell === 3 || cell === 4) shut = cell;
      g.lineWidth = 0.009; g.strokeStyle = ink;
      if (shut === 1) {                 // parpadeo: línea curva hacia abajo
        g.beginPath(); g.moveTo(cx - rx, cy + 0.004); g.quadraticCurveTo(cx, cy - 0.022, cx + rx, cy + 0.004); g.stroke();
      } else if (shut === 4) {          // alegría: arcos ^ ^
        g.lineWidth = 0.011;
        g.beginPath(); g.moveTo(cx - rx, cy - 0.012); g.quadraticCurveTo(cx, cy + 0.05, cx + rx, cy - 0.012); g.stroke();
      } else if (shut === 3) {          // esfuerzo: apretados > <
        g.lineWidth = 0.01;
        g.beginPath(); g.moveTo(cx - s * rx * 0.9, cy + 0.028); g.lineTo(cx + s * rx * 0.5, cy); g.lineTo(cx - s * rx * 0.9, cy - 0.028); g.stroke();
        g.beginPath(); g.moveTo(cx - s * rx * 0.3, cy + 0.03); g.quadraticCurveTo(cx + s * rx * 0.9, cy, cx - s * rx * 0.3, cy - 0.03); g.stroke();
      } else {
        g.save();
        ell(g, cx, cy, rx, ry); g.fillStyle = '#ffffff'; g.fill(); g.clip();
        ell(g, cx + px, cy + py, pr * 0.9, pr); g.fillStyle = ink; g.fill();                              // pupila
        g.fillStyle = '#ffffff';
        ell(g, cx + px - s * 0.009, cy + py + 0.012, pr * 0.34, pr * 0.36); g.fill();                     // brillo grande
        ell(g, cx + px + s * 0.008, cy + py - 0.011, pr * 0.16, pr * 0.17); g.fill();                     // brillo chico
        if (lid > 0) {                                                                                     // párpado (piel) con línea de tinta
          var ly = cy + ry - 2 * ry * lid, t = tilt * s;
          g.fillStyle = hexCss(L.skin); g.beginPath();
          g.moveTo(cx - rx * 1.4, ly - t * rx); g.lineTo(cx + rx * 1.4, ly + t * rx); g.lineTo(cx + rx * 1.4, cy + ry * 1.5); g.lineTo(cx - rx * 1.4, cy + ry * 1.5); g.closePath(); g.fill();
          g.strokeStyle = ink; g.lineWidth = 0.009; g.beginPath(); g.moveTo(cx - rx * 1.4, ly - t * rx); g.lineTo(cx + rx * 1.4, ly + t * rx); g.stroke();
        }
        g.restore();
        g.strokeStyle = ink; g.lineWidth = 0.0075; ell(g, cx, cy, rx, ry); g.stroke();
      }
    }
    paintGlasses(g, cell, L, tc);
    for (s = -1; s <= 1; s += 2) {
      // cejas GRUESAS: llevan la expresión (bi interior, bo exterior, bm centro; Y en metros)
      var bi = BROW_Y, bo = BROW_Y - 0.012, bm = BROW_Y + 0.006, bw = 0.024;
      if (cell === 2) { bi = BROW_Y - 0.03; bo = BROW_Y + 0.004; bm = BROW_Y - 0.016; }            // V de concentración
      if (cell === 7) { bi = BROW_Y - 0.05; bo = BROW_Y + 0.0; bm = BROW_Y - 0.03; bw = 0.024; }    // V de grito
      if (cell === 3) { bi = BROW_Y - 0.038; bo = BROW_Y - 0.01; bm = BROW_Y - 0.03; }             // esfuerzo
      if (cell === 5) { bi = BROW_Y + 0.012; bo = BROW_Y - 0.03; bm = BROW_Y + 0.002; }            // pena: por dentro arriba
      if (cell === 4) { bi = BROW_Y + 0.02; bo = BROW_Y + 0.01; bm = BROW_Y + 0.03; }              // alegría: altas
      if (cell === 6) { bi = BROW_Y + 0.035; bo = BROW_Y + 0.022; bm = BROW_Y + 0.045; }           // sorpresa: muy altas
      if (halo) { g.strokeStyle = halo; g.lineWidth = bw + 0.012; g.beginPath(); g.moveTo(s * 0.035, bi); g.quadraticCurveTo(s * 0.08, bm, s * 0.13, bo); g.stroke(); }
      g.strokeStyle = brow; g.lineWidth = bw;
      g.beginPath(); g.moveTo(s * 0.035, bi); g.quadraticCurveTo(s * 0.08, bm, s * 0.13, bo); g.stroke();
    }
  }
  /** Barba (ranura beard) en la celda de boca: perilla y barba de tres días en el mentón (antes que la boca, con el borde degradado
   *  a alfa 0 en el último 15 % de la celda para que no se vea el corte de la lámina) y bigote encima de la boca (después). */
  //  phase 0 = antes de la boca (perilla, barba de tres días y, en la celda del grito, el bigote: asoma a los lados de la O), 1 = después.
  var BEARD_Y0 = HEAD_C0 + FM_DY0 * HEAD_RY0;
  function beardHex(L) { return mixHex(L.hair, 0x000000, 0.1); }
  function paintBeard(g, cell, L, tc, phase) {
    var b = L.beard, i, x, y, a, fx, fy, BEARD_X = FM_DX * HEAD_RX / FK;   // medio ancho de la lámina de boca en metros de v1
    if (!b || (b === 'bigote' ? (cell === 2 ? 0 : 1) : 0) !== phase) return;
    g.save(); g.beginPath(); g.rect(-0.2, BEARD_Y0 - 0.02, 0.4, MOUTH_TOP - BEARD_Y0 + 0.02); g.clip();   // nunca en el solape con los ojos
    var col = beardHex(L), r = col >> 16 & 255, gg = col >> 8 & 255, bb = col & 255, H = MOUTH_TOP - BEARD_Y0;
    function fade(px, py) {   // 1 dentro; 0 en el borde de la lámina (últimos 15 % en x y en y)
      fx = clamp((BEARD_X - Math.abs(px)) / (BEARD_X * 0.15), 0, 1); fy = clamp((py - BEARD_Y0) / (H * 0.15), 0, 1); return fx * fy;
    }
    if (b === 'bigote') {     // dos lóbulos sobre el labio (en la celda del grito sube y queda debajo de la O)
      var my = MOUTH_Y + 0.0072 + (cell === 2 ? 0.006 : 0);
      g.fillStyle = hexCss(col); g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.0035;
      g.beginPath(); g.moveTo(0, my + 0.006);
      g.bezierCurveTo(-0.02, my + 0.0125, -0.05, my + 0.009, -0.064, my - 0.007); g.bezierCurveTo(-0.045, my - 0.002, -0.022, my - 0.007, 0, my - 0.002);
      g.bezierCurveTo(0.022, my - 0.007, 0.045, my - 0.002, 0.064, my - 0.007); g.bezierCurveTo(0.05, my + 0.009, 0.02, my + 0.0125, 0, my + 0.006);
      g.closePath(); g.fill(); g.stroke();
    } else if (b === 'perilla') {   // perilla en la barbilla, que se difumina hacia el borde de la lámina
      var py0 = MOUTH_Y - 0.03, gy = BEARD_Y0 + H * 0.15;
      var grd = g.createLinearGradient(0, gy, 0, gy + H * 0.12);
      grd.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + bb + ',0)'); grd.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + bb + ',1)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-0.026, py0); g.quadraticCurveTo(0, py0 + 0.008, 0.026, py0); g.quadraticCurveTo(0.03, gy + 0.01, 0, gy - 0.004); g.quadraticCurveTo(-0.03, gy + 0.01, -0.026, py0); g.closePath(); g.fill();
      g.fillStyle = hexCss(col); g.beginPath(); g.moveTo(-0.012, MOUTH_Y - 0.016); g.lineTo(0.012, MOUTH_Y - 0.016); g.lineTo(0.008, py0 + 0.004); g.lineTo(-0.008, py0 + 0.004); g.closePath(); g.fill();
    } else if (b === 'tresDias') {  // barba de tres días: punteado determinista (sin azar) por mandíbula y bigote, sin tapar la boca
      for (i = 0; i < 520; i++) {
        x = ((i * 0.6180339) % 1) * 2 - 1; y = (i * 0.7548777) % 1;
        x *= BEARD_X; y = BEARD_Y0 + y * (MOUTH_Y + 0.03 - BEARD_Y0);
        var mx = x / 0.075, myy = (y - (MOUTH_Y - 0.004)) / 0.034;
        if (mx * mx + myy * myy < 1) continue;                                     // la boca queda limpia
        a = 0.42 * fade(x, y) * (y > MOUTH_Y + 0.004 ? clamp((MOUTH_Y + 0.03 - y) / 0.026, 0, 1) * 0.9 : 1);
        if (a <= 0.01) continue;
        g.fillStyle = 'rgba(' + r + ',' + gg + ',' + bb + ',' + a.toFixed(3) + ')'; ell(g, x, y, 0.0024, 0.0024); g.fill();
      }
    }
    g.restore();
  }
  function paintMouth(g, cell, L, tc) {
    var ink = hexCss(faceInk(tc)), cy = MOUTH_Y, inner = '#5a1620', tongue = '#ef6f78', teeth = '#fffaf0', halo = faceHalo(L);
    if (halo) { g.fillStyle = halo; ell(g, 0, cy - 0.004, 0.075, 0.04); g.fill(); }
    paintBeard(g, cell, L, tc, 0);
    g.strokeStyle = ink; g.lineWidth = 0.008;
    switch (cell) {
      case 1:   // sonrisa grande con dientes (D)
        g.save(); g.beginPath(); g.moveTo(-0.07, cy + 0.012); g.quadraticCurveTo(0, cy - 0.07, 0.07, cy + 0.012); g.closePath();
        g.fillStyle = inner; g.fill(); g.clip(); g.fillStyle = teeth; g.fillRect(-0.08, cy - 0.0, 0.16, 0.014);
        g.fillStyle = tongue; ell(g, 0.01, cy - 0.034, 0.03, 0.018); g.fill(); g.restore();
        g.beginPath(); g.moveTo(-0.07, cy + 0.012); g.quadraticCurveTo(0, cy - 0.07, 0.07, cy + 0.012); g.closePath(); g.stroke(); break;
      case 2:   // grito: O grande con dientes arriba y lengua
        g.save(); ell(g, 0, cy - 0.01, 0.048, 0.05); g.fillStyle = inner; g.fill(); g.clip();
        g.fillStyle = tongue; ell(g, 0, cy - 0.052, 0.036, 0.022); g.fill();
        g.fillStyle = teeth; g.fillRect(-0.06, cy + 0.024, 0.12, 0.014); g.restore();
        ell(g, 0, cy - 0.01, 0.048, 0.05); g.stroke(); break;
      case 3:   // dientes apretados
        g.fillStyle = teeth; ell(g, 0, cy, 0.056, 0.02); g.fill();
        g.lineWidth = 0.005; g.beginPath(); g.moveTo(-0.052, cy); g.lineTo(0.052, cy);
        for (var k = -2; k <= 2; k++) { g.moveTo(k * 0.02, cy - 0.018); g.lineTo(k * 0.02, cy + 0.018); }
        g.stroke(); g.lineWidth = 0.008; ell(g, 0, cy, 0.056, 0.02); g.stroke(); break;
      case 4:   // pena: arco hacia abajo
        g.beginPath(); g.moveTo(-0.045, cy - 0.022); g.quadraticCurveTo(0, cy + 0.016, 0.045, cy - 0.022); g.stroke(); break;
      case 5:   // «o» chica (sorpresa)
        ell(g, 0, cy - 0.004, 0.02, 0.023); g.fillStyle = inner; g.fill(); g.stroke(); break;
      case 6:   // sonrisa abierta con lengua fuera
        g.save(); g.beginPath(); g.moveTo(-0.06, cy + 0.012); g.quadraticCurveTo(0, cy - 0.06, 0.06, cy + 0.012); g.closePath();
        g.fillStyle = inner; g.fill(); g.clip(); g.fillStyle = teeth; g.fillRect(-0.07, cy - 0.0, 0.14, 0.012); g.restore();
        g.fillStyle = tongue; ell(g, 0.012, cy - 0.038, 0.026, 0.028); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-0.06, cy + 0.012); g.quadraticCurveTo(0, cy - 0.06, 0.06, cy + 0.012); g.closePath(); g.stroke(); break;
      case 7:   // línea tensa (concentración), ligeramente torcida
        g.beginPath(); g.moveTo(-0.045, cy - 0.004); g.lineTo(0.04, cy - 0.012); g.stroke(); break;
      default:  // neutra: sonrisa corta
        g.beginPath(); g.moveTo(-0.035, cy + 0.004); g.quadraticCurveTo(0, cy - 0.012, 0.035, cy + 0.004); g.stroke();
    }
    paintBeard(g, cell, L, tc, 1);
  }

  // =====================================================================
  //  MATERIAL: toon de DOS bandas (solo la luz principal en bandas), ambiente teñido, brillo de borde, celdas de la cara
  // =====================================================================
  var GRAD = null, SHADE = [0.12, 0.09, 0.2], SHADE_SKIN = [0.18, 0.09, 0.1], TOON_CHUNK = null;
  function gradient2() {
    if (GRAD) return GRAD;
    // 10 texeles: 0-5 sombra (0,5), 6-9 luz: el terminador queda en N·L ≈ 0,2 (la sombra ocupa algo menos de media bola)
    var d = new Uint8Array(40); for (var i = 0; i < 10; i++) { var v = i < 6 ? 128 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    GRAD = new THREE.DataTexture(d, 10, 1, THREE.RGBAFormat); GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.generateMipmaps = false; GRAD.needsUpdate = true;
    return GRAD;
  }
  function toonLightsChunk() {
    if (TOON_CHUNK) return TOON_CHUNK;
    var src = THREE.ShaderChunk.lights_toon_pars_fragment, a = 'vec3 irradiance = getGradientIrradiance( geometry.normal, directLight.direction ) * directLight.color;';
    if (src.indexOf(a) < 0) return (TOON_CHUNK = src);
    return (TOON_CHUNK = src.replace(a, 'float vbL = dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) );\n' +
      '\tvec3 vbB = getGradientIrradiance( geometry.normal, directLight.direction );\n' +
      '\tvec3 vbS = vec3( 0.55 * saturate( dot( geometry.normal, directLight.direction ) ) );\n' +
      '\tvec3 irradiance = mix( vbS, vbB, smoothstep( 1.2, 2.4, vbL ) ) * directLight.color;'));
  }
  /** Material del muñeco: atlas propio (ropa, dorsal `num`, cara), toon de dos bandas, celdas de la cara por uniformes.
   *  px = escala del lienzo (2 → 1024², 1 → 512²); beach = versión de playa. */
  function dollMaterial(tc, L, num, beach, px) {
    var K = px === 1 ? 1 : 2, cv = canvas(ATLAS * K, ATLAS * K); paintAtlas(cv, tc, L, num, beach);
    var t = texOf(cv), m = new THREE.MeshToonMaterial({ map: t, vertexColors: true, gradientMap: gradient2() });
    // lo que hay pintado ahora (la vista previa del Vestuario repinta este mismo lienzo: el repintado de la fuente usa lo último)
    m.userData.paint = { tc: tc, L: L, num: num, beach: beach };
    var eyeOff = m.userData.eyeOff = new THREE.Vector2(), mouthOff = m.userData.mouthOff = new THREE.Vector2();
    var fe0 = (1 - (FE_Y + FE_H) / ATLAS - 0.004).toFixed(4), fe1 = (1 - FE_Y / ATLAS + 0.004).toFixed(4);
    var fm0 = (1 - (FM_Y + FM_H) / ATLAS - 0.004).toFixed(4), fm1 = (1 - FM_Y / ATLAS + 0.004).toFixed(4);
    var rim = new THREE.Color(0xfff1e0).multiplyScalar(0.14);
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uRim = { value: rim };
      sh.uniforms.uShade = { value: new THREE.Vector3(SHADE[0], SHADE[1], SHADE[2]) };
      sh.uniforms.uShadeSkin = { value: new THREE.Vector3(SHADE_SKIN[0], SHADE_SKIN[1], SHADE_SKIN[2]) };
      sh.uniforms.uEyeOff = { value: eyeOff }; sh.uniforms.uMouthOff = { value: mouthOff };
      sh.fragmentShader = 'uniform vec3 uRim;\nuniform vec3 uShade;\nuniform vec3 uShadeSkin;\nuniform vec2 uEyeOff;\nuniform vec2 uMouthOff;\nfloat vbFace = 0.0;\n' + sh.fragmentShader
        .replace('#include <lights_toon_pars_fragment>', toonLightsChunk())
        .replace('#include <map_fragment>', '#ifdef USE_UV\n  vec2 vbUv = vUv;\n' +
          '  float vbFE = step( ' + fe0 + ', vUv.y ) * step( vUv.y, ' + fe1 + ' );\n' +
          '  float vbFM = step( ' + fm0 + ', vUv.y ) * step( vUv.y, ' + fm1 + ' );\n' +
          '  vbFace = max( vbFE, vbFM );\n  vbUv += uEyeOff * vbFE + uMouthOff * vbFM;\n#endif\n' +
          THREE.ShaderChunk.map_fragment.replace(/vUv/g, 'vbUv'))
        .replace('#include <output_fragment>',
          'outgoingLight += diffuseColor.rgb * mix( uShade, uShadeSkin, vbFace );\n' +
          'float vbRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );\n' +
          'outgoingLight += uRim * smoothstep( 0.72, 0.78, vbRim );\n' +
          // blanco de los ojos y dientes con algo de luz propia: no se tiñe de violeta en la sombra
          'outgoingLight += diffuseColor.rgb * 0.5 * vbFace * smoothstep( 0.72, 0.92, min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) ) );\n' +
          '#include <output_fragment>');
    };
    m.customProgramCacheKey = function () { return 'vbDollToon'; };
    try { if (document.fonts && document.fonts.load) document.fonts.load('italic 900 100px "Barlow Condensed"').then(function () { var a = m.userData.paint; if (m.map === t && a) { paintAtlas(cv, a.tc, a.L, a.num, a.beach); t.needsUpdate = true; } }).catch(function () { }); } catch (e) { }
    return m;
  }
  // contorno de tinta de color: VB.TOON.outline de arena (grosor en píxeles, tope en metros, peso `ow` por vértice, color propio)
  var OUT_PX = 3.6, OUT_MAX = 0.06, OUT_MIN = 0.003;
  function ensureInk(r) {
    var T = VB.TOON; if (r.ink || !T || !T.outline) return;
    r.ink = T.outline(r.skin, OUT_MIN, { max: OUT_MAX, k: T.px ? OUT_PX / T.px : 1, color: inkHex(r.tc) });
    if (r.ink) r.ink.name = r.skin.name + 'Ink';
  }

  // =====================================================================
  //  PIEZAS (espacio del hueso; todas en la pose de reposo)
  // =====================================================================
  var TORSO_PROF = [[0, -0.13], [0.12, -0.12], [0.185, -0.06], [0.205, 0.04], [0.2, 0.16], [0.185, 0.3], [0.168, 0.44], [0.152, 0.56], [0.13, 0.64], [0.085, 0.69], [0, 0.705]];
  function torsoGeo(G, r) {
    // pera limpia: redonda por abajo (entre las piernas), más ancha en la barriga, se estrecha hacia el domo de los hombros
    // (perfil diseñado para un tronco de 0,67: TORSO_K lo estira/acorta; TORSO_W lo ensancha por abajo —chibi rechoncho— y nada arriba)
    var prof = TORSO_PROF;
    var pts = []; for (var i = 0; i < prof.length; i++) pts.push(V2(prof[i][0] * lerp(TORSO_W, 1, clamp((prof[i][1] + 0.13) / 0.7, 0, 1)), prof[i][1] * TORSO_K));
    // piel a dos huesos: la mitad alta sigue al pecho (flexión suave del tronco sin costura)
    G.bone2 = r.bones.indexOf(r.chest); G.w2 = function (y) { return sstep(0.1 * TORSO_K, 0.5 * TORSO_K, y); };
    G.mode = 'wrap'; G.rows = TR_R; G.yr = [TR_Y0, TR_Y1];
    G.add(lathe(pts, 30, 14), null, 0, 0, 0, 0, 0, 0, 1, 1, 0.86);
    G.mode = 'flat'; G.bone2 = -1; G.w2 = null;
  }
  /** Radios (x, z) del tronco a la altura `yp` del hueso de la pelvis (el mismo perfil que torsoGeo): para apoyar piezas encima. */
  function torsoR(yp) {
    var P = TORSO_PROF, y = yp / TORSO_K, i, t, rr;
    if (y <= P[0][1]) return [0, 0];
    for (i = 1; i < P.length; i++) if (y <= P[i][1] || i === P.length - 1) break;
    t = clamp((y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]), 0, 1); rr = lerp(P[i - 1][0], P[i][0], t) * lerp(TORSO_W, 1, clamp((y + 0.13) / 0.7, 0, 1));
    return [rr, rr * 0.86];
  }
  var QT = null;
  /** Ángulos (Euler XYZ, los de Geo.add) que llevan el eje `ax` ('y' | 'z') de una pieza a la dirección (dx, dy, dz). */
  function aim(dx, dy, dz, ax) {
    if (!QT) QT = { q: new THREE.Quaternion(), e: new THREE.Euler(), a: new THREE.Vector3(), d: new THREE.Vector3() };
    QT.a.set(0, ax === 'z' ? 0 : 1, ax === 'z' ? 1 : 0); QT.d.set(dx, dy, dz).normalize();
    QT.q.setFromUnitVectors(QT.a, QT.d); QT.e.setFromQuaternion(QT.q, 'XYZ');
    return [QT.e.x, QT.e.y, QT.e.z];
  }
  /** Pieza con su eje `ax` orientado a (dx, dy, dz). */
  function addAim(G, geo, hex, x, y, z, d, ax, sx, sy, sz) { var e = aim(d[0], d[1], d[2], ax); G.add(geo, hex, x, y, z, e[0], e[1], e[2], sx, sy, sz); }

  // bola del hombro un punto más oscura que la camiseta: se lee como pieza aparte aunque el tronco sea del mismo color
  // (playa: hombro de piel por los tirantes; con la licra de surf, del color de la licra)
  function shoulderGeo(G, tc, X, beach) { G.add(sph(BALL_SH, 16, 12), beach ? (X.under === 'licra' ? colB(X, tc) : X.skin) : mixHex(tc.base, tc.dark, 0.14)); }
  /** Brazo k (0 izquierdo, 1 derecho): tubo en su columna de ARM_R, girado para que gu = 0,5 mire hacia fuera. */
  function upperGeo(G, k) { G.mode = 'strip'; G.rows = ARM_R; G.su = COL_UP[k]; G.add(tube(TUBE_ARM, UPPER), null, 0, -UPPER / 2, 0, 0, TUBE_RY[k], 0); G.mode = 'flat'; G.su = SU_ALL; }
  /** Color de la bola del codo del brazo k: piel; cB con la térmica; el del manguito de ese brazo; cA con coderas (mandan). */
  function elbowHex(X, tc, k) {
    var arm = k ? X.armR : X.armL, c = X.skin;
    if (!X.beach && X.under === 'termica') c = colB(X, tc);
    if (ARMS[arm] && arm !== 'kinesio') c = arm === 'manguitoOro' ? GOLD : arm === 'manguitoLlamas' ? tc.dark : arm === 'manguitoMazo' ? MAZO_DK : colA(X, tc);
    if (X.elbows === 'coderas') c = colA(X, tc);
    return c;
  }
  /** Antebrazo k: bola del codo (coderas: algo mayor) y tubo en su columna de ARM_R (la piel, la térmica o el manguito van pintados). */
  function foreGeo(G, X, tc, k) {
    var e = X.elbows === 'coderas' ? 1.12 : 1;
    G.add(sph(BALL_EL, 14, 10), elbowHex(X, tc, k), 0, 0, 0, 0, 0, 0, e, e, e);
    G.mode = 'strip'; G.rows = ARM_R; G.su = COL_FORE[k];
    G.add(tube(TUBE_ARM, FORE), null, 0, -FORE / 2, 0, 0, TUBE_RY[k], 0);
    G.mode = 'flat'; G.su = SU_ALL;
  }
  /** Muñequera de rizo y reloj (ranuras wristL / wristR) en el hueso del ANTEBRAZO, junto a la muñeca: así heredan el estirón (se
   *  alargan y adelgazan con el antebrazo, como el resto del brazo cartoon); en la mano, que recupera su tamaño con la escala inversa,
   *  quedarían flotando y más anchas que la muñeca estirada. La esfera del reloj mira hacia fuera (sin marca). */
  function wristGeo(G, X, tc, k) {
    var w = k ? X.wristR : X.wristL, s = k ? -1 : 1, y = -FORE + 0.015;
    if (w === 'muneq') { G.owk = 0.5; G.add(torus(TUBE_ARM + 0.008, 0.014, 5, 16), colA(X, tc), 0, y, 0, PI / 2, 0, 0); }
    else if (w === 'munhCanon') {   // jefe Cañón: la muñequera de rizo, negra con el aro de cA por fuera (la boca del cañón)
      var rc = TUBE_ARM + 0.008, ca = colA(X, tc);
      G.owk = 0.5; G.vc = function (px, py, pz) { return Math.sqrt(px * px + py * py) > rc + 0.006 && Math.abs(pz) < 0.007 ? ca : null; };   // rombos de cA en zigzag
      G.add(torus(rc, 0.0155, 5, 16), NEUTRAL_DK, 0, y, 0, PI / 2, 0, 0, 1, 1, 1.5); G.vc = null;
    }
    else if (w === 'reloj') {
      G.owk = 0.5; G.add(torus(TUBE_ARM + 0.004, 0.009, 5, 16), NEUTRAL_DK, 0, y, 0, PI / 2, 0, 0, 1, 1, 1.5);                 // correa
      G.add(cyl(0.024, 0.024, 0.014, 14), colA(X, tc), s * (TUBE_ARM + 0.012), y, 0, 0, 0, PI / 2);                            // caja
      if (LODR > 0) { G.owk = 0; G.add(new THREE.CircleGeometry(0.018, sg(12, 8)), 0xf4f4f4, s * (TUBE_ARM + 0.0195), y, 0, 0, s * PI / 2, 0); }   // esfera (no en LOD0)
    }
    G.owk = 1;
  }
  /** Manopla grande y redonda (sin dedos) con el pulgar insinuado. Plano de la mano = Y-Z del hueso (grosor en X). Vestuario: mitones
   *  (manopla y pulgar de cA) y dedos vendados (pulgar de esparadrapo y una vuelta aplastada en la punta; la vuelta, no en LOD0). */
  function handGeo(G, X, tc, s) {
    var K = HAND_K, tp = TAPED[X.hands], tape = !!tp, cm = X.hands === 'mitones' ? colA(X, tc) : X.skin;
    G.owk = 0.75;
    G.add(sph(1, 16, 12), cm, 0, -PALM, 0.004, 0, 0, 0, 0.058 * K, 0.108 * K, 0.094 * K);
    if (tp === STEEL) G.vc = function (px, py) { return Math.abs(py) < 0.5 ? STEEL_DK : null; };   // hierro: tira oscura en el pulgar
    G.add(capsule(1, 1.4, 2, 8), tape ? tp : cm, 0, -0.06 * K, 0.085 * K, -0.75, 0, 0, 0.034 * K, 0.034 * K, 0.034 * K);   // pulgar
    G.vc = null;
    if (tape && LODR > 0) { G.owk = 0.5; G.add(torus(1, 0.14, 5, 16), tp === STEEL ? STEEL_DK : tp, 0, -PALM - 0.058 * K, 0.004, PI / 2, 0, 0, 0.05 * K, 0.081 * K, 0.08 * K); }   // (no en LOD0: 1 cm)
    G.vc = null;
    G.owk = 1;
  }
  function thighGeo(G, tc, beach, k) {
    G.add(sph(BALL_HIP, 12, 9), beach ? tc.base : tc.shorts);                // bola de la cadera (asoma al levantar la pierna); playa: malla
    G.mode = 'strip'; G.rows = TH_R; G.su = COL_TH[k]; G.add(tube(TUBE_LEG, THIGH), null, 0, -THIGH / 2, 0, 0, TUBE_RY[k], 0); G.mode = 'flat'; G.su = SU_ALL;
  }
  /** Bola de la rodilla: rodillera (cortas, altas: oscuro del equipo) o rodilla desnuda (bajadas o sin; con malla larga, cB). */
  function kneeHex(X, tc) { return X.knees === 'rodiPulpo' ? PULPO : X.knees === 'cortas' || X.knees === 'altas' ? tc.pad : X.legs === 'mallaLarga' ? colB(X, tc) : X.skin; }
  // ventosas de la rodillera de pulpo (solo LOD2, bola de 16 × 12): casillas [columna, fila] de la esfera, una cara doble cada una,
  // al tresbolillo por delante (+Z: columna 4 de 16 = 90°, filas 5-7 de 12 = el ecuador)
  var PULPO_Q = { '2,5': 1, '4,5': 1, '6,5': 1, '3,7': 1, '5,7': 1, '1,7': 1, '7,7': 1 };
  function pulpoDots(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1, ph = Math.atan2(z, -x); if (ph < 0) ph += PI * 2;
    return PULPO_Q[Math.floor(ph / (PI / 8)) + ',' + Math.floor(Math.acos(clamp(y / l, -1, 1)) / (PI / 12))] ? PULPO_HI : null;
  }
  function shinGeo(G, tc, X, beach, k) {
    // rodilla: bola = RODILLERA pintada (oscuro del equipo); en la playa, la rodilla desnuda (piel); altas: algo mayor
    var hi = !!KNEE_HI[X.knees];
    if (X.knees === 'rodiPulpo' && LODR === 2) G.vc = pulpoDots;   // ventosas por delante
    G.add(sph(BALL_KN, 16, 12), kneeHex(X, tc), 0, 0, 0.004, 0, 0, 0, hi ? 1.08 * 1.12 : 1.08, hi ? 1.1 : 1, hi ? 1.04 * 1.12 : 1.04);
    G.vc = null;
    G.mode = 'strip'; G.rows = SHN_R; G.su = COL_SHN[k]; G.add(tube(TUBE_LEG * 0.96, SHIN), null, 0, -SHIN / 2, 0, 0, TUBE_RY[k], 0); G.mode = 'flat'; G.su = SU_ALL;
  }
  /** Playa: pie DESCALZO de muñeco (empeine redondo de piel, planta con arena, dedo gordo insinuado) con la tobillera del Vestuario:
   *  tela (toro de cA, la de siempre), pulsera de tobillo (aro fino, no en LOD0), escarpines (pie de cSock, sin tobillera) o nada.
   *  La planta queda en -ANKLE como la suela del zapatón. s: 1 izquierdo, -1 derecho (el dedo gordo, hacia dentro). */
  var SAND_HEX = 0xe8cf9a;
  function footGeo(G, X, tc, s) {
    var K = FOOT_K, Y = -ANKLE + 0.062, esc = X.ankle === 'escarpines', sk = esc ? colSock(X, tc) : X.skin;
    G.add(sph(0.05 * K, 12, 8), sk, 0, -0.045, -0.012, 0, 0, 0, 1, 1.0, 1.1);                                               // tobillo y talón
    G.add(sph(1, 16, 10, 0, PI * 2, 0, PI * 0.5), sk, 0, Y, 0.045 * K, 0, 0, 0, 0.078 * K, 0.07 * Math.sqrt(K), 0.14 * K);     // empeine (media esfera)
    G.add(sph(1, 16, 6, 0, PI * 2, PI * 0.5, PI * 0.5), mixHex(sk, SAND_HEX, esc ? 0.3 : 0.4), 0, Y, 0.045 * K, 0, 0, 0, 0.08 * K, 0.062, 0.142 * K); // planta con arena
    G.owk = 0.5; G.add(sph(0.03 * K, 10, 7), sk, -s * 0.034 * K, Y + 0.004, 0.045 * K + 0.125 * K, 0, 0, 0, 1, 0.8, 1.1);   // dedo gordo
    if (X.ankle === 'tela') { G.owk = 0; G.add(torus(0.05 * K, 0.011, 5, 16), colA(X, tc), 0, -0.01, -0.006, PI / 2, 0, 0, 1, 1, 1.05); }   // tobillera de tela
    else if (X.ankle === 'tobiPulpo') {   // jefe Pulpo: la tobillera de tela con ventosas claras alternas por fuera
      var ra = 0.05 * K, ct = mixHex(colA(X, tc), PULPO_HI, 0.7), st = 2 * PI / sg(16, 10);
      G.vc = function (px, py) { return Math.sqrt(px * px + py * py) > ra + 0.004 && Math.floor((Math.atan2(py, px) + PI) / st) % 2 === 0 ? ct : null; };
      G.owk = 0; G.add(torus(ra, 0.012, 5, 16), colA(X, tc), 0, -0.01, -0.006, PI / 2, 0, 0, 1, 1, 1.4); G.vc = null;
    }
    else if (X.ankle === 'pulseraTob' && LODR > 0) { G.owk = 0; G.add(torus(0.053 * K, 0.0045, 4, 10), colA(X, tc), 0, -0.024, -0.006, PI / 2 + 0.14, 0, 0, 1, 1, 1.05); }
    G.owk = 1;
  }
  /** Zapatón redondeado grande (empeine con la puntera del acento, suela, tobillera y ribete); la planta queda en -ANKLE. Vestuario:
   *  el empeine según las zapatillas (clásicas y neón admiten cShoe), y la tobillera blanca (oscura con las negras) o del empeine. */
  var SHOE_UP = { clasicas: 0xf4f4f4, negras: NEUTRAL_DK, neon: 0xd8ff3a, doradas: GOLD };
  // Empeine: media esfera con el POLO hacia delante (WP1 del plan del Vestuario): sus anillos son cortes verticales a lo ancho, así que la
  // puntera es un color por vértice de los SHOE_TOE primeros anillos (borde recto y limpio, sin la escalera de las dos esferas que se
  // cortaban) y sin pieza propia: −208 triángulos por pie en LOD2, −101 en LOD1, −64 en LOD0. 16 segmentos de lado a lado por encima y 14 de la
  // punta al talón (antes eran 9: el perfil de lado sale más redondo con los mismos triángulos).
  var SHOE_TOE = 0.36;  // fracción de la longitud (polo → polo) que es puntera
  // distancia entre dos colores (RGB «redmean», 0-765): barata y bastante parecida a lo que ve el ojo
  function hexDist(a, b) {
    var r = ((a >> 16 & 255) + (b >> 16 & 255)) / 2, dr = (a >> 16 & 255) - (b >> 16 & 255), dg = (a >> 8 & 255) - (b >> 8 & 255), db = (a & 255) - (b & 255);
    return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
  }
  // color de un detalle (puntera, ribete) sobre el color c0 de debajo: el pedido si se distingue; si no (el acento amarillo de un
  // equipo sobre las neón o las doradas, el blanco sobre las clásicas), el color base del equipo y, si tampoco, oscuro o blanco
  function onShoe(want, c0, tc) {
    if (hexDist(want, c0) >= 150) return want;
    if (typeof tc.base === 'number' && hexDist(tc.base, c0) >= 220) return tc.base;
    return lumHex(c0) > 0.5 ? NEUTRAL_DK : 0xf4f4f4;
  }
  function shoeGeo(G, tc, X) {
    var K = FOOT_K, Y = -ANKLE + 0.075, sh = SHOE_UP[X.shoes] ? X.shoes : 'clasicas';   // la planta sigue en -ANKLE: el zapatón crece en largo y ancho (y algo en alto)
    var up = (sh === 'clasicas' || sh === 'neon') && X.cShoe >= 0 ? X.cShoe : SHOE_UP[sh];
    // las doradas no pegan la suela al empeine (la amarilla de un equipo desaparecía bajo el dorado); las demás, la del equipo como siempre
    var sole = sh === 'neon' ? 0x1d1d22 : sh === 'doradas' ? onShoe(tc.sole, up, tc) : tc.sole, toe = sh === 'doradas' ? GOLD_HI : onShoe(tc.accent, up, tc);
    var ank = X.ankle === 'blanca' ? (sh === 'negras' ? 0x2c2c34 : 0xf4f4f4) : up;
    // y de la primitiva = eje del polo (+1 la punta): la puntera son los anillos enteros con y > cos(kc·π/h) (el centro de cada triángulo
    // queda estrictamente entre sus dos anillos, así que el corte cae justo en la línea del anillo kc en cualquier LOD)
    var hs = sg(14, 5), kc = Math.max(1, Math.round(hs * SHOE_TOE)), ty = Math.cos(kc * PI / hs);
    G.vc = function (px, py) { return py > ty ? toe : null; };
    G.add(sph(1, 16, 14, PI, PI, 0, PI), up, 0, Y, 0.055 * K, PI / 2, 0, 0, 0.092 * K, 0.158 * K, 0.088 * Math.sqrt(K));   // empeine (media esfera, polo delante)
    G.vc = null;
    G.add(sph(1, 18, 7, 0, PI * 2, PI * 0.5, PI * 0.5), sole, 0, Y, 0.055 * K, 0, 0, 0, 0.094 * K, 0.075, 0.16 * K);   // suela (media esfera aplastada)
    G.add(cyl(0.05 * K, 0.056 * K, 0.06, 14), ank, 0, -0.03, -0.005);                                                 // tobillera
    G.owk = 0;
    G.add(cyl(0.057 * K, 0.057 * K, 0.014, 14, true), onShoe(tc.accent, ank, tc), 0, -0.012, -0.005);                 // ribete del tobillo
    G.owk = 1;
  }
  /** Cuello (ranura neck) en el hueso del pecho: un aro inclinado que se apoya en el domo de los hombros, por delante más bajo y por
   *  debajo de la mandíbula. Medalla: cinta de cA + disco dorado; collar de conchas: cordón + 5 conchas (las conchas, solo en LOD2). */
  function neckGeo(G, X, tc) {
    if (!X.neck) return;
    var co = SPINE_Y + CHEST_Y, hb = NECK_Y + HEAD_C - 0.95 * HEAD_RY, yf = hb - 0.07, yb = hb + 0.03, off = 0.012;
    var rf = torsoR(yf + co), rb = torsoR(yb + co), zf = rf[1] + off, zb = rb[1] + off;
    var t = Math.atan2(yb - yf, zf + zb), cy = (yf + yb) / 2, cz = (zf - zb) / 2, az = Math.sqrt((yb - yf) * (yb - yf) + (zf + zb) * (zf + zb)) / 2;
    var ax = torsoR(cy + co)[0] + off, i, ph;
    function ringPt(p) { return [ax * Math.sin(p), cy - Math.sin(t) * az * Math.cos(p), cz + Math.cos(t) * az * Math.cos(p)]; }
    if (X.neck === 'medalla') {
      G.owk = 0.5; G.add(torus(1, 0.06, 4, 24), colA(X, tc), 0, cy, cz, PI / 2 + t, 0, 0, ax, az, az);                      // cinta
      var dy = yf - 0.04, rd = torsoR(dy + co);
      G.owk = 0.6; G.add(cyl(0.032, 0.032, 0.008, 12), GOLD, 0, dy, rd[1] + 0.01, PI / 2 - 0.22, 0, 0);                       // medalla
      if (LODR > 0) { G.owk = 0; G.add(new THREE.CircleGeometry(0.02, sg(12, 8)), GOLD_HI, 0, dy + 0.0012, rd[1] + 0.0145, -0.22, 0, 0); }   // relieve (no en LOD0)
    } else if (X.neck === 'conchas') {
      G.owk = 0; G.add(torus(1, 0.035, 4, 24), 0x6b4a2e, 0, cy, cz, PI / 2 + t, 0, 0, ax, az, az);                          // cordón
      if (LODR === 2) for (i = -2; i <= 2; i++) {
        ph = i * 0.33; var p = ringPt(ph);
        G.owk = 0.5; G.add(sph(1, 8, 6), i % 2 ? 0xf2c7b0 : 0xf6e7d0, p[0], p[1] - 0.008, p[2] + 0.004, -0.4 - t, ph, 0, 0.016, 0.019, 0.009);
      }
    }
    G.owk = 1;
  }
  // ONLINE (fase 3, especialista net): la gorra «Online Beta Tester» lleva «MTC» en el frontal. Es una tira de la misma copa de la gorra
  // (un 1,2 % más grande) con una malla de 13 × 5 caras alineada con este dibujo de píxeles (M de 5, T y C de 3, separadas por 1): cada
  // cara se pinta por vértice (G.vc) con la letra o con cA. Siempre 13 × 5 (130 triángulos en todos los LOD): con menos, no se lee.
  var MTC_ROWS = ['X...X.XXX..XX', 'XX.XX..X..X..', 'X.X.X..X..X..', 'X...X..X..X..', 'X...X..X...XX'];
  var MTC_PHI0 = PI / 2 - 0.6, MTC_PHI = 1.2, MTC_TH0 = 0.8, MTC_TH = 0.5;   // (frontal, justo encima de la visera)
  function mtcPanel(G, cA, R) {
    var ink = lumHex(cA) > 0.6 ? 0x1c2233 : 0xf6f3ea, cols = MTC_ROWS[0].length, rows = MTC_ROWS.length;
    G.owk = 0;
    G.vc = function (px, py, pz) {
      var ph = Math.atan2(pz, -px), th = Math.acos(Math.max(-1, Math.min(1, py / (Math.sqrt(px * px + py * py + pz * pz) || 1))));
      var c = Math.floor((ph - MTC_PHI0) / MTC_PHI * cols), r = Math.floor((th - MTC_TH0) / MTC_TH * rows);
      return r >= 0 && r < rows && c >= 0 && c < cols && MTC_ROWS[r].charAt(c) === 'X' ? ink : null;
    };
    G.add(new THREE.SphereGeometry(1, cols, rows, MTC_PHI0, MTC_PHI, MTC_TH0, MTC_TH), cA, 0, HEAD_C + 0.02, -0.005, 0.1, 0, 0,
      (R + 0.012) * 1.015, (HEAD_RY + 0.03) * 1.015, (HEAD_RZ + 0.018) * 1.015);
    G.vc = null; G.owk = 1;
  }
  /** Cabeza, orejas, pelo y gorro (hueso head). Con un gorro de HIDE_HAIR el pelo es solo el casquete de la nuca; las trenzas y las
   *  coletas salen por debajo (la coleta, por el hueco de atrás: faceGeo). */
  function headGeo(G, X, tc) {
    var sk = X.skin, hr = X.hair, cA = colA(X, tc), cB = colB(X, tc), hide = !!HIDE_HAIR[X.head], s, i;
    G.add(headSphere(sg(30, 16), sg(20, 12)), sk);
    G.owk = 0.6; for (s = -1; s <= 1; s += 2) G.add(sph(0.046 * FK, 10, 8), sk, s * (HEAD_RX - 0.005), HEAD_C - 0.005, -0.01, 0, 0, 0, 0.45, 1, 0.85);   // orejas sencillas
    G.owk = 1;
    var R = HEAD_RX + 0.01;
    /** casquete de pelo: media esfera algo mayor que el cráneo, abierta por abajo (thetaLength) y echada atrás (rot) */
    function cap(col, theta, rot, k) { G.add(new THREE.SphereGeometry(1, sg(26, 14), sg(14, 7), 0, PI * 2, 0, theta), col, 0, HEAD_C + 0.012, -0.012, rot || 0, 0, 0, R * (k || 1), (HEAD_RY + 0.012) * (k || 1), (HEAD_RZ + 0.012) * (k || 1)); }
    /** mechón liso en lágrima (punta en +Y) */
    function tuft(len, rr, seg) { return lathe([V2(0, 0), V2(rr * 0.8, len * 0.08), V2(rr, len * 0.3), V2(rr * 0.74, len * 0.62), V2(rr * 0.3, len * 0.9), V2(0, len)], seg || 10, 6); }
    function braids() {   // dos trenzas gordas que caen por detrás de las orejas, con sus gomas
      var bp = []; for (i = 0; i <= 10; i++) bp.push(V2(i === 0 || i === 10 ? 0 : (i % 2 ? 0.04 : 0.028) * (1 - i * 0.04), -i * 0.035));
      for (s = -1; s <= 1; s += 2) G.add(lathe(bp, 10, 6), hr, s * (HEAD_RX - 0.03), HEAD_C + 0.02, -0.1, 0.3, 0, s * 0.2);
      G.owk = 0; for (s = -1; s <= 1; s += 2) G.add(torus(0.02, 0.008, 5, 12), cA, s * (HEAD_RX - 0.03 + 0.07), HEAD_C - 0.3, -0.07, PI / 2, 0, 0); G.owk = 1;
    }
    function pigtails() {  // coletas: a los lados, por detrás de las orejas, rígidas en la cabeza (el muelle del pelo es uno solo)
      var tp = [V2(0, 0), V2(0.042, -0.03), V2(0.05, -0.1), V2(0.042, -0.18), V2(0.024, -0.25), V2(0, -0.27)];
      for (s = -1; s <= 1; s += 2) {
        var kx = s * (HEAD_RX + 0.012), ky = HEAD_C + 0.035 * FK, kz = -0.075;
        G.add(sph(0.045 * FK, 8, 6), hr, kx, ky, kz, 0, 0, 0, 1, 0.9, 1.1);                                                    // nudo
        G.owk = 0; addAim(G, torus(0.03 * FK, 0.01, 5, 12), cA, kx - s * 0.012, ky - 0.004, kz, [s, -0.2, 0], 'z'); G.owk = 1;   // goma
        addAim(G, lathe(tp, 10, 6), hr, kx + s * 0.012, ky - 0.012, kz - 0.006, [-s * 0.42, 1, 0.22], 'y', FK, FK, FK * 0.85); // cola
      }
    }
    switch (hide ? 'hat' : X.style) {
      case 'tupe':        // tupé: casquete + mechón grande hacia delante y arriba
        cap(hr, PI * 0.42, -0.25);
        G.add(tuft(0.26 * FK, 0.11 * FK), hr, 0.01, HEAD_C + 0.13 * FK, 0.03 * FK, 0.95, 0, -0.15, 1.5, 1, 0.75);
        // (2º mechón echado hacia delante y pegado al 1r: casi derecho, visto por detrás eran dos picos como orejas de gato)
        G.add(tuft(0.15 * FK, 0.085 * FK), hr, -0.01, HEAD_C + 0.13 * FK, -0.03 * FK, 0.7, 0, 0.05, 1.4, 1, 0.7);
        break;
      case 'coleta':      // coleta alta: casquete + goma + cola (en el hueso del pelo, para el muelle)
        cap(hr, PI * 0.46, -0.2);
        G.owk = 0; G.add(torus(R * 0.98, 0.016, 6, 30), cA, 0, HEAD_C + 0.1 * FK, -0.01, PI / 2 - 0.2, 0, 0, 0.98, 1.04, 1); G.owk = 1;   // cinta del equipo
        break;
      case 'afro': {      // afro redondo: bola grande que envuelve la cabeza, abierta por delante (la cara queda libre)
        var ax = HEAD_RX + 0.08, ay = HEAD_RY + 0.07, az = HEAD_RZ + 0.07, ac = HEAD_C + 0.045, azc = -0.035;
        G.add(new THREE.SphereGeometry(1, sg(28, 14), sg(8, 4), 0, PI * 2, 0, PI * 0.36), hr, 0, ac, azc, 0, 0, 0, ax, ay, az);        // casquete alto completo
        G.add(new THREE.SphereGeometry(1, sg(28, 14), sg(10, 5), PI * 0.5 + 1.05, PI * 2 - 2.1, PI * 0.36, PI * 0.5), hr, 0, ac, azc, 0, 0, 0, ax, ay, az);   // anillo sin la cuña de la cara
        // rizos: bultos medio hundidos por detrás, los lados y arriba (revisión 11-nov: visto por detrás o desde arriba era una bola
        // lisa que parecía un casco); el contorno de tinta los dibuja y la silueta queda ondulada
        var na = sg(9, 6), th, ph, sth;
        for (i = 0; i < na * 2; i++) {
          th = i < na ? PI * 0.2 : PI * 0.52; ph = PI * 0.5 + 1.2 + (i % na + (i < na ? 0.5 : 0)) * (PI * 2 - 2.4) / (na - 1);   // fuera de la cuña de la cara
          sth = Math.sin(th);
          G.add(sph(1, 8, 6), hr, -ax * 0.96 * sth * Math.cos(ph), ac + ay * 0.96 * Math.cos(th), azc + az * 0.96 * sth * Math.sin(ph), 0, 0, 0, 0.055, 0.05, 0.055);   // (convenio de SphereGeometry)
        }
        G.add(sph(1, 8, 6), hr, 0, ac + ay * 0.97, azc - 0.01, 0, 0, 0, 0.06, 0.045, 0.06);
        break; }
      case 'flequillo':   // melena a tazón: casquete con borde recto justo encima de las cejas (flequillo liso) y algo más largo a los lados
        cap(hr, PI * 0.37, 0.0, 1.03);
        for (s = -1; s <= 1; s += 2) G.add(sph(1, 10, 8), hr, s * (HEAD_RX + 0.012), HEAD_C + 0.03, -0.03, 0, 0, 0, 0.03, 0.085, 0.1);   // mechones laterales
        break;
      case 'rapado':      // rapado: casquete finísimo pegado al cráneo (se lee por el color)
        cap(hr, PI * 0.47, -0.1, 0.985);
        break;
      case 'mono':        // moño alto: casquete + bola arriba con goma
        cap(hr, PI * 0.46, -0.15);
        G.add(sph(0.085 * FK, 16, 12), hr, 0, HEAD_C + HEAD_RY + 0.045 * FK, -0.05, 0, 0, 0, 1, 0.9, 1);
        G.owk = 0; G.add(torus(0.05 * FK, 0.012, 5, 16), cA, 0, HEAD_C + HEAD_RY - 0.01, -0.05, PI / 2 + 0.15, 0, 0); G.owk = 1;
        break;
      case 'trenzas':     // dos trenzas gordas que caen por detrás de las orejas
        cap(hr, PI * 0.5, -0.1);
        braids();
        break;
      case 'dosmonos': {  // dos moños redondos arriba a los lados, medio hundidos, con su goma en la base
        cap(hr, PI * 0.46, -0.15);
        var bx = 0.13 * FK, by = HEAD_RY * 0.78;
        for (s = -1; s <= 1; s += 2) {
          G.add(sph(0.068 * FK, 16, 12), hr, s * bx, HEAD_C + by, -0.04, 0, 0, 0, 1, 0.95, 1);
          G.owk = 0; addAim(G, torus(0.045 * FK, 0.011, 5, 16), cA, s * bx * 0.8, HEAD_C + by * 0.8, -0.04, [s * bx, by, 0], 'z'); G.owk = 1;
        }
        break; }
      case 'coletas':     // coletas: casquete + dos colas a los lados
        cap(hr, PI * 0.47, -0.15);
        pigtails();
        break;
      case 'cresta': {    // cresta: rapado + tres mechones de punta en fila por el centro (finos de lado, largos de delante atrás)
        cap(hr, PI * 0.47, -0.1, 0.985);
        var CZ = [0.1, -0.005, -0.11], CL = [0.15, 0.19, 0.16], CR = [-0.05, 0.3, 0.7], rz0 = (HEAD_RZ + 0.012) * 0.985, ry0 = (HEAD_RY + 0.012) * 0.985;
        for (i = 0; i < 3; i++) {
          var z = CZ[i] * FK, yy = HEAD_C + 0.012 + ry0 * Math.sqrt(Math.max(0, 1 - ((z + 0.012) / rz0) * ((z + 0.012) / rz0))) - 0.035;
          G.add(tuft(CL[i] * FK, 0.06 * FK), hr, 0, yy, z, CR[i], 0, 0, 0.42, 1, 0.95);
        }
        break; }
      case 'hat':         // gorros que sustituyen al pelo: el pelo solo asoma por la nuca (con la gorra al revés, también por delante)
        cap(hr, PI * 0.44, X.head === 'gorraAtras' ? -0.1 : -0.2, 0.99);
        // (revisión 11-nov: el casquete de pelo hasta el ecuador y la banda oscura hacían un aro negro bajo la gorra que, con la
        // cabeza inclinada, tapaba los ojos; ahora el pelo queda dentro de la gorra salvo en la nuca y no hay banda)
        if (X.head === 'pescador') {   // gorro de pescador: copa de cA y ala caída alrededor (anillo cerrado que nace en el borde)
          // (la copa acaba por encima de las cejas y el ala cae poco: los ojos se siguen viendo)
          var cs = [R + 0.016, HEAD_RY + 0.034, HEAD_RZ + 0.022], tht = PI * 0.4, st = Math.sin(tht), ct = Math.cos(tht), cy0 = HEAD_C + 0.02, ry = 0.04;
          G.add(new THREE.SphereGeometry(1, sg(26, 14), sg(12, 6), 0, PI * 2, 0, tht), cA, 0, cy0, -0.005, ry, 0, 0, cs[0], cs[1], cs[2]);
          G.add(lathe([V2(st * 0.985, ct + 0.01), V2(st * 1.3, ct - 0.065), V2(st * 1.31, ct - 0.1), V2(st * 0.97, ct - 0.025), V2(st * 0.985, ct + 0.01)], 16, 8),
            mixHex(cA, 0x000000, 0.12), 0, cy0, -0.005, ry, 0, 0, cs[0], cs[1], cs[2]);
          var bh = ct + 0.06, br = Math.sqrt(1 - bh * bh);
          G.owk = 0; G.add(torus(1, 0.03, 4, sg(24, 12)), cB, 0, cy0 + cs[1] * bh * Math.cos(ry), -0.005 + cs[1] * bh * Math.sin(ry),
            PI / 2 + ry, 0, 0, cs[0] * br * 1.01, cs[2] * br * 1.01, 0.6); G.owk = 1;   // cinta de la copa
          break;
        }
        var back = X.head === 'gorraAtras';
        G.add(new THREE.SphereGeometry(1, sg(26, 14), sg(12, 6), 0, PI * 2, 0, PI * 0.46), cA, 0, HEAD_C + 0.02, -0.005, back ? -0.1 : 0.1, 0, 0, R + 0.012, HEAD_RY + 0.03, HEAD_RZ + 0.018);
        if (back) G.add(sph(1, 16, 4, 0, PI * 2, 0, PI * 0.5), cB, 0, HEAD_C + 0.095 * FK, -(HEAD_RZ + 0.055 * FK), 0.3, PI, 0, 0.16 * FK, 0.016, 0.135 * FK);   // visera atrás
        else G.add(sph(1, 16, 4, 0, PI * 2, 0, PI * 0.5), cB, 0, HEAD_C + 0.095 * FK, HEAD_RZ + 0.055 * FK, -0.3, 0, 0, 0.16 * FK, 0.016, 0.135 * FK);       // visera (del oscuro)
        G.owk = 0; G.add(sph(0.016, 6, 4), cB, 0, HEAD_C + HEAD_RY + 0.03, -0.005); G.owk = 1;
        if (X.head === 'gorraMTC') mtcPanel(G, cA, R);   // ONLINE (fase 3): «MTC» en el frontal de la gorra
        break;
      default:
        cap(hr, PI * 0.44, -0.2);
    }
    if (hide && X.style === 'trenzas') braids();
    else if (hide && X.style === 'coletas') pigtails();
    if (X.head === 'visera') {   // visera deportiva: banda abierta por arriba (cilindro corto) + ala del acento con filo oscuro
      // (con afro el ala sale del borde del pelo, a la altura de la frente y casi plana: antes nacía dentro de la bola y asomaba
      // por arriba o de lado como una pieza suelta)
      var vy = HEAD_C + 0.1 * FK, vz = HEAD_RZ + 0.08 * FK, vt = -0.4;
      if (X.style === 'afro') { var vth = PI * 0.36; vy = HEAD_C + 0.045 + (HEAD_RY + 0.07) * Math.cos(vth) - 0.012; vz = -0.035 + (HEAD_RZ + 0.07) * Math.sin(vth) + 0.05 * FK; vt = -0.15; }
      else G.add(new THREE.CylinderGeometry(R + 0.008, R + 0.012, 0.045 * FK, sg(24, 12), 1, true), cA, 0, HEAD_C + 0.1 * FK, -0.01, -0.1, 0, 0, 1, 1, 1.0);
      G.add(sph(1, 16, 4, 0, PI * 2, 0, PI * 0.5), cA, 0, vy, vz, vt, 0, 0, 0.16 * FK, 0.014, 0.13 * FK);
      G.owk = 0; G.add(sph(1, 16, 3, 0, PI * 2, PI * 0.5, PI * 0.5), cB, 0, vy - 0.001 * FK, vz, vt, 0, 0, 0.158 * FK, 0.008, 0.128 * FK); G.owk = 1;
    } else if (X.head === 'cinta' || X.head === 'bandana') {   // cinta del acento alrededor de la frente (el pañuelo, además, nudo y colas: faceGeo)
      G.add(torus(R + 0.004, 0.02 * FK, 6, 32), cA, 0, HEAD_C + 0.085 * FK, -0.008, PI / 2 - 0.08, 0, 0, 1, 1.05, 1);
      G.owk = 0; G.add(torus(R + 0.0045, 0.009 * FK, 5, 32), X.head === 'bandana' ? mixHex(cA, 0xffffff, 0.45) : cB, 0, HEAD_C + 0.085 * FK, -0.008, PI / 2 - 0.08, 0, 0, 1, 1.05, 1); G.owk = 1;
    } else if (X.head === 'cintaRizo') {   // cinta de rizo: gruesa y mullida, sin filete
      G.owk = 0.5; G.add(torus(R + 0.008, 0.036 * FK, 6, 32), cA, 0, HEAD_C + 0.085 * FK, -0.008, PI / 2 - 0.08, 0, 0, 1, 1.05, 1); G.owk = 1;
    } else if (X.head === 'corona') crownGeo(G, X);
    G.owk = 1;
  }
  /** Coronita dorada en zigzag, inclinada (con afro, en lo alto del afro): anillo cerrado (lathe) con las puntas alternas subidas. */
  function crownGeo(G, X) {
    var n = sg(12, 8), r0 = 0.068 * FK, h = 0.05 * FK, pts = [V2(r0, 0), V2(r0 + 0.009, 0), V2(r0 + 0.013, h), V2(r0 + 0.004, h), V2(r0, 0)];
    var geo = new THREE.LatheGeometry(pts, n, 0, PI * 2), P = geo.attributes.position, i;
    for (i = 0; i < P.count; i++) if (P.getY(i) > h * 0.5) P.setY(i, Math.floor(i / pts.length) % 2 ? h * 0.5 : h * 1.3);   // puntas
    geo.computeVertexNormals();
    // con tupé, el mechón (hasta HEAD_C + 0,28 por delante) la tapaba de frente: va más arriba y atrás, inclinada hacia la nuca (rx
    // −0,5), con la gema y las puntas asomando por encima del mechón
    var tup = X.style === 'tupe';
    var y0 = X.style === 'afro' ? HEAD_C + 0.045 + (HEAD_RY + 0.07) * 0.97 - 0.03 : tup ? HEAD_C + HEAD_RY + 0.045 * FK : HEAD_C + 0.012 + (HEAD_RY + 0.012) - 0.026,
      z0 = tup ? -0.065 * FK : -0.025, tl = 0.15, tx = tup ? -0.5 : 0;
    G.owk = 0.6; G.add(geo, GOLD, 0, y0, z0, tx, 0, tl);
    var gy = h * 0.45;   // gema roja delante, girada con la corona
    G.owk = 0.5; G.add(sph(1, 8, 6), 0xe0383e, -gy * Math.sin(tl), y0 + gy * Math.cos(tl) * Math.cos(tx) - (r0 + 0.011) * Math.sin(tx), z0 + (r0 + 0.011) * Math.cos(tx) + gy * Math.cos(tl) * Math.sin(tx), tx, 0, 0, 0.013, 0.013, 0.007);
    G.owk = 1;
  }
  /** Gafas (hueso head): las de la frente son de geometría (montura de cGlass, lentes con brillo, puente y patillas); las pintadas
   *  (atlas) solo llevan aquí las patillas, del borde de la lámina de la cara a la oreja (no en LOD0: miden menos de 3 cm de grueso). */
  function eyesGeo(G, X, tc) {
    var s, gl = glassHex(X, tc), R = HEAD_RX + 0.01;
    if (X.eyes === 'frente') {   // gafas de sol subidas a la frente (la cara sigue leyéndose): lentes oscuras con brillo
      var gy = HEAD_C + 0.14 * FK, gz = headFrontZ(0.085 * FK, gy) - 0.012, LENS = 0x1a2340;
      for (s = -1; s <= 1; s += 2) {
        G.owk = 0.6; G.add(sph(1, 14, 8), gl, s * 0.088 * FK, gy, gz + 0.01, -0.5, 0, 0, 0.082 * FK, 0.06 * FK, 0.03);              // montura
        G.owk = 0; G.add(sph(1, 14, 8), LENS, s * 0.088 * FK, gy, gz + 0.022, -0.5, 0, 0, 0.068 * FK, 0.048 * FK, 0.022);                   // lente
        G.add(sph(1, 8, 6), 0xdfe8ff, s * 0.07 * FK, gy + 0.018 * FK, gz + 0.04, -0.5, 0, 0, 0.018 * FK, 0.009 * FK, 0.006);                    // brillo
      }
      G.owk = 0.6; G.add(cyl(0.01, 0.01, 0.03 * FK, 6), gl, 0, gy + 0.004, gz + 0.02, 0, 0, PI / 2);                     // puente
      G.owk = 0; for (s = -1; s <= 1; s += 2) G.add(cyl(0.008, 0.008, 0.2, 6), gl, s * (R + 0.004), gy, gz - 0.09, PI / 2, 0, 0); G.owk = 1;   // patillas
      return;
    }
    if (!X.eyes || LODR === 0) return;
    // patillas: varilla recta por fuera de la cabeza, desde donde acaba la lámina de ojos (dx = FE_DX) hasta detrás de la oreja
    var ey = HEAD_C + (GLASS_Y + 0.02 - HEAD_C0) * FK, dy = (ey - HEAD_C) / HEAD_RY, c = Math.sqrt(1 - dy * dy), o = { x: 0, y: 0, z: 0 };
    function surf(phi, off) { headShape(c * Math.sin(phi), dy, c * Math.cos(phi), o); return [o.x + Math.sin(phi) * off, o.y, o.z + Math.cos(phi) * off]; }
    var p0 = Math.asin(Math.min(0.99, FE_DX / c)), p1 = PI / 2 + 0.14, A = surf(p0, 0.004), B = surf(p1, 0.012), k, t, it;
    for (it = 0; it < 3; it++) {   // que la cuerda no se meta en la cabeza: se empujan los dos extremos hacia fuera lo que falte
      var need = 0;
      for (k = 1; k < 8; k++) {
        t = k / 8; var qx = lerp(A[0], B[0], t), qz = lerp(A[2], B[2], t), ph = Math.atan2(qx, qz), S = surf(ph, 0.003);
        need = Math.max(need, Math.sqrt(S[0] * S[0] + S[2] * S[2]) - Math.sqrt(qx * qx + qz * qz));
      }
      if (need <= 0) break;
      A = surf(p0, 0.004 + need * (it + 1)); B = surf(p1, 0.012 + need * (it + 1));
    }
    var L = Math.sqrt((B[0] - A[0]) * (B[0] - A[0]) + (B[2] - A[2]) * (B[2] - A[2]) + (B[1] - A[1]) * (B[1] - A[1]));
    G.owk = 0;
    for (s = -1; s <= 1; s += 2) addAim(G, new THREE.CylinderGeometry(0.0055, 0.0055, L, 6, 1, true), gl, s * (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2, [s * (B[0] - A[0]), B[1] - A[1], B[2] - A[2]], 'y');
    G.owk = 1;
  }
  /** Láminas de la cara (sin contorno, UV propia) y, en el hueso del pelo (el muelle): la cola de la coleta (con gorra o gorra al
   *  revés sale más abajo, por el hueco de atrás) y el nudo y las colas del pañuelo. */
  function faceGeo(G, r, X, tc, on) {
    on(r.head); G.owk = 0; G.mode = 'own';
    var nx = Math.max(6, Math.round(12 * LODK + 0.5)), ny = Math.max(4, Math.round(7 * LODK + 0.5));
    G.add(faceSheet(nx, ny, FE_DX, FE_DY0, FE_DY1, 0, FE_Y, FE_W, FE_H), 0xffffff);
    G.add(faceSheet(Math.max(4, nx - 3), 4, FM_DX, FM_DY0, FM_DY1, 0, FM_Y, FM_W, FM_H), 0xffffff);
    G.mode = 'flat'; G.owk = 1;
    // posición del hueso del pelo en el espacio de la cabeza (pose de reposo): lo de la cabeza se pasa al hueso del pelo
    var mh = r.rest[r.bones.indexOf(r.head)].elements, mp = r.rest[r.bones.indexOf(r.hair)].elements;
    var hx = mp[12] - mh[12], hy = mp[13] - mh[13], hz = mp[14] - mh[14], cA = colA(X, tc);
    if (X.style === 'coleta' && X.head !== 'pescador') {
      on(r.hair);
      var dy = 0, dz = 0;
      if (HIDE_HAIR[X.head]) { dy = HEAD_C + 0.05 * FK - hy - 0.01; dz = -(HEAD_RZ - 0.012) - hz; }   // por debajo del borde de la gorra
      G.add(sph(0.062, 14, 10), X.hair, 0, 0.01 + dy, dz, 0, 0, 0, 1, 0.9, 1.1);                                              // nudo
      G.owk = 0; G.add(torus(0.04, 0.012, 5, 12), cA, 0, -0.02 + dy, -0.03 + dz, -1.0, 0, 0); G.owk = 1;                     // goma
      G.add(lathe([V2(0, 0), V2(0.05, -0.03), V2(0.06, -0.12), V2(0.05, -0.22), V2(0.03, -0.3), V2(0.01, -0.36), V2(0, -0.37)], 12, 6), X.hair, 0, -0.03 + dy, -0.05 + dz, 0.5, 0, 0, 1, 1, 0.85);   // cola
    }
    if (X.head === 'bandana') {   // pañuelo: nudo detrás, a la altura de la cinta, y dos colas aplastadas que se mueven con el muelle
      on(r.hair);
      var ky = HEAD_C + 0.085 * FK - hy, kz = -(HEAD_RZ + 0.02) - hz, s;
      G.add(sph(1, 8, 6), cA, 0, ky, kz, 0, 0, 0, 0.032, 0.027, 0.024);
      for (s = -1; s <= 1; s += 2) G.add(capsule(1, 1.6, 2, 8), cA, s * 0.026, ky - 0.05, kz - 0.016, 0.35, 0, s * 0.35, 0.022, 0.03, 0.007);
    }
  }

  // =====================================================================
  //  RIG: mismo esqueleto que players.js (27 huesos, mismo orden)
  // =====================================================================
  /** Posiciones (espacio del hueso de la cabeza / del pecho) de los huesos vacíos de la cara y del pelo, para que players.js
   *  monte el mismo esqueleto: {eyes, mouth, teeth, browL, browR, hair} = [x, y, z]. */
  function boneLayout() {
    var fz = headFrontZ, eY = HEAD_C + (EYE_Y - HEAD_C0) * FK, mY = HEAD_C + (MOUTH_Y - HEAD_C0) * FK, bY = HEAD_C + (BROW_Y - HEAD_C0) * FK, eX = EYE_X * FK;
    return { eyes: [0, eY, fz(eX, eY)], mouth: [0, mY, fz(0, mY)], teeth: [0, mY, fz(0, mY)], browL: [eX, bY, fz(eX, bY)], browR: [-eX, bY, fz(eX, bY)], hair: [0, HEAD_C + HEAD_RY - 0.02, -0.06] };
  }
  /** Muñeco completo (esqueleto, malla y material). opt (vista previa del Vestuario): {tc, num, beach, px, lod}; sin opt, la maqueta
   *  (equipo TEAMS[L.team], dorsal L.num, L.beach, atlas de 1024² y la malla alta). */
  function buildRig(L, idx, opt) {
    opt = opt || {};
    var tc = opt.tc || (DBG_TC && DBG_TC[L.team | 0]) || TEAMS[L.team | 0] || TEAMS[0], root = new THREE.Group(); root.name = 'doll' + idx;
    var bones = [];
    function bone(parent, x, y, z) { var b = new THREE.Bone(); b.position.set(x || 0, y || 0, z || 0); parent.add(b); bones.push(b); return b; }
    var body = bone(root);
    var pelvis = bone(body, 0, HIP_H, 0);
    var spine = bone(pelvis, 0, SPINE_Y, 0);
    var chest = bone(spine, 0, CHEST_Y, 0);
    var head = bone(chest, 0, NECK_Y, 0); head.rotation.order = 'YXZ';
    var fz = headFrontZ;
    // huesos de la cara (vacíos: la cara es una textura) en la cabeza activa (rasgos de v1 escalados ×FK)
    var eY = HEAD_C + (EYE_Y - HEAD_C0) * FK, mY = HEAD_C + (MOUTH_Y - HEAD_C0) * FK, bY = HEAD_C + (BROW_Y - HEAD_C0) * FK, eX = EYE_X * FK;
    var eyes = bone(head, 0, eY, fz(eX, eY)), mouth = bone(head, 0, mY, fz(0, mY)), teeth = bone(head, 0, mY, fz(0, mY));
    var browL = bone(head, eX, bY, fz(eX, bY)), browR = bone(head, -eX, bY, fz(eX, bY));
    var hair = bone(head, 0, HEAD_C + HEAD_RY - 0.02, -0.06);
    // medidas con las que se construyó ESTE muñeco (las poses y el balón las leen de aquí: así conviven v1 y chibi en la comparación)
    var D = { body: BODY, HIP_H: HIP_H, NECK_Y: NECK_Y, SH_X: SH_X, PALM: PALM, UPPER: UPPER, FORE: FORE, STRETCH: STRETCH_MAX, LEG: THIGH + SHIN, SH_H: SH_H, HEAD_C: HEAD_C, HEAD_RY: HEAD_RY, top: SH_H + HEAD_C + HEAD_RY, heads: (SH_H + HEAD_C + HEAD_RY) / (2 * HEAD_RY), reach: REACH, reachRest: REACH_REST };
    var r = { idx: idx, look: L, tc: tc, D: D, root: root, body: body, pelvis: pelvis, spine: spine, chest: chest, head: head, eyes: eyes, mouth: mouth, teeth: teeth, brow: [browL, browR], hair: hair,
      sh: [], up: [], el: [], hand: [], hip: [], th: [], kn: [], ft: [], face: 'neutra', faceE: 0, faceM: 0, blinkT: 1.5 + idx * 0.9, blinkOn: 0, pose: 'idle', t0: idx * 0.37, tFix: -1, ball: null, geos: [null, null, null], ink: null };
    for (var k = 0; k < 2; k++) {
      var s = k === 0 ? 1 : -1;
      var sh = bone(chest, s * SH_X, SH_Y, SH_Z), up = bone(sh), el = bone(up, 0, -UPPER, 0), hd = bone(el, 0, -FORE, 0);
      r.sh.push(sh); r.up.push(up); r.el.push(el); r.hand.push(hd);
      var hp = bone(pelvis, s * HIP_W, 0, 0), th = bone(hp), kn = bone(th, 0, -THIGH, 0), ft = bone(kn, 0, -SHIN, 0);
      r.hip.push(hp); r.th.push(th); r.kn.push(kn); r.ft.push(ft);
    }
    root.updateMatrixWorld(true);
    r.bones = bones; r.rest = [];
    for (k = 0; k < bones.length; k++) r.rest.push(bones[k].matrixWorld.clone());
    r.beach = opt.beach != null ? !!opt.beach : !!L.beach || DBG_BEACH; r.num = opt.num != null ? opt.num : L.num;
    var skin = new THREE.SkinnedMesh(rigGeometry(r, opt.lod != null ? opt.lod : LODR), dollMaterial(tc, L, r.num, r.beach, opt.px || 2));
    skin.castShadow = true; skin.receiveShadow = true; skin.name = 'dollSkin' + idx; skin.frustumCulled = false;
    root.add(skin); root.updateMatrixWorld(true);
    skin.bind(new THREE.Skeleton(bones), skin.matrixWorld);
    r.skin = skin;
    ensureInk(r);
    r.handL = r.hand[0]; r.handR = r.hand[1]; r.footL = r.ft[0]; r.footR = r.ft[1];
    return r;
  }
  /** Geometría del muñeco para un nivel de detalle (0 baja, 1 media, 2 alta), en la pose de reposo guardada (r.rest).
   *  El rig (de aquí o de players.js) trae: bones, rest, look (la L del Vestuario o la vieja {skin, hair, style, acc}: normLook),
   *  tc (equipación), beach, geos[3] y los
   *  huesos pelvis, chest, head, hair, sh/up/el/hand/th/kn/ft. Se guarda en r.geos[lod]. */
  function rigGeometry(r, lod) {
    if (r.geos[lod]) return r.geos[lod];
    if (!THREE) THREE = window.THREE;
    var keepK = LODK, keepR = LODR; LODK = LOD_K[lod]; LODR = lod;
    var G = new Geo(), tc = r.tc, bch = !!r.beach, X = normLook(r.look, bch), k, s;
    function on(b) { var i = r.bones.indexOf(b); G.pre = r.rest[i]; G.bone = i; G.mode = 'flat'; G.owk = 1; G.su = SU_ALL; return G; }
    try {
      torsoGeo(on(r.pelvis), r);
      headGeo(on(r.head), X, tc); eyesGeo(G, X, tc); faceGeo(G, r, X, tc, on);
      if (X.neck) neckGeo(on(r.chest), X, tc);
      for (k = 0; k < 2; k++) {
        s = k === 0 ? 1 : -1;
        shoulderGeo(on(r.sh[k]), tc, X, bch); upperGeo(on(r.up[k]), k); foreGeo(on(r.el[k]), X, tc, k); wristGeo(G, X, tc, k); handGeo(on(r.hand[k]), X, tc, s);
        thighGeo(on(r.th[k]), tc, bch, k); shinGeo(on(r.kn[k]), tc, X, bch, k);
        if (bch) footGeo(on(r.ft[k]), X, tc, s); else shoeGeo(on(r.ft[k]), tc, X);
      }
    } finally { LODK = keepK; LODR = keepR; }
    return (r.geos[lod] = G.build());
  }
  function setLod(r, lod) {
    var g = rigGeometry(r, lod);
    if (r.skin.geometry !== g) { r.skin.geometry = g; if (r.ink) r.ink.geometry = g; }
  }
  function triCount(geo) { return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; }

  // ---------- Cara: celdas → uniformes del material ----------
  /** Celda de ojos (0-7) y de boca (0-7) en un material del muñeco (dos uniformes; sin texturas ni mallas nuevas). */
  function faceCells(mat, e, m) {
    var ud = mat && mat.userData; if (!ud || !ud.eyeOff) return false;
    ud.eyeOff.set((e & 3) * FE_W / ATLAS, -(e >> 2) * FE_H / ATLAS);
    ud.mouthOff.set((m & 7) * FM_W / ATLAS, 0);
    return true;
  }
  function setFaceCells(r, e, m) { r.faceE = e; r.faceM = m; faceCells(r.skin.material, e, m); }
  function setFace(r, name) { var x = EXPR[name] || EXPR.neutra; r.face = EXPR[name] ? name : 'neutra'; setFaceCells(r, r.blinkOn > 0 ? 1 : x[0], x[1]); }
  /** Parpadeo: cada 2-5 s, 0,12 s con la celda 1 (no en las expresiones con los ojos ya cerrados). */
  function blink(r, dt) {
    var x = EXPR[r.face] || EXPR.neutra;
    if (r.blinkOn > 0) { r.blinkOn -= dt; if (r.blinkOn <= 0) { r.blinkOn = 0; setFaceCells(r, x[0], x[1]); } return; }
    r.blinkT -= dt;
    if (r.blinkT <= 0) { r.blinkT = 2 + Math.random() * 3; if (x[0] === 0 || x[0] === 2 || x[0] === 5 || x[0] === 6) { r.blinkOn = 0.12; setFaceCells(r, 1, x[1]); } }
  }

  // =====================================================================
  //  POSES (a mano, rotando huesos) y ANIMACIÓN DE DEMOSTRACIÓN (squash & stretch como escalas de huesos)
  // =====================================================================
  // Convenciones (huesos en reposo con la identidad; extremidades colgando en -Y): rotation.x < 0 lleva la mano/pie hacia
  // DELANTE (+Z); rotation.z > 0 lleva la mano hacia +X (la izquierda del muñeco). s = +1 lado izquierdo, -1 derecho.
  function rot(b, x, y, z) { b.rotation.set(x || 0, y || 0, z || 0); }
  function resetPose(r) {
    var i; for (i = 0; i < r.bones.length; i++) { r.bones[i].rotation.set(0, 0, 0); r.bones[i].scale.set(1, 1, 1); }
    r.body.position.set(0, 0, 0); r.pelvis.position.set(0, r.D.HIP_H, 0); r.head.position.set(0, r.D.NECK_Y, 0);
  }
  var POSES = {
    /** de pie, en reposo, con el balón en la mano derecha a la altura de la barriga */
    idle: function (r) {
      rot(r.pelvis, 0.02, 0, 0.02); rot(r.chest, 0, 0.06, -0.02); rot(r.head, 0.04, -0.14, -0.05);
      rot(r.up[0], -0.1, 0, 0.14); rot(r.el[0], -0.3, 0, 0.05);
      rot(r.up[1], -0.55, 0, -0.1); rot(r.el[1], -1.45, 0.0, 0); rot(r.hand[1], 0.3, 0, 0);
      rot(r.th[0], 0.02, 0, 0.06); rot(r.th[1], -0.02, 0, -0.1); rot(r.kn[1], 0.06, 0, 0); rot(r.ft[0], 0, 0.05, -0.06); rot(r.ft[1], -0.04, -0.1, 0.1);
    },
    /** recepción / plataforma: rodillas flexionadas, tronco adelante, brazos rectos y juntos, mirada al balón */
    recv: function (r) {
      var th = -1.0, kn = 1.35;
      r.pelvis.position.y = r.D.HIP_H - 0.26 * r.D.LEG;   // lo que acortan las rodillas flexionadas (pies en el suelo)
      rot(r.pelvis, 0.42, 0, 0); rot(r.chest, 0.22, 0, 0); rot(r.head, -0.62, 0, 0);
      for (var k = 0; k < 2; k++) {
        var s = k ? -1 : 1;
        rot(r.th[k], th, 0, s * 0.22); rot(r.kn[k], kn, 0, 0); rot(r.ft[k], -(th + kn) - 0.42, 0, -s * 0.22);
        rot(r.up[k], -0.78, 0, -s * 0.16); rot(r.el[k], 0.0, 0, -s * 0.06); rot(r.hand[k], 0.15, s * 1.3, 0);
      }
    },
    /** remate en el aire: brazo derecho armado, cuerpo arqueado, piernas recogidas (el estirón al golpe lo pone animate con reachTo) */
    spike: function (r) {
      r.body.position.y = 0.72;
      rot(r.pelvis, -0.22, 0.1, 0); rot(r.chest, -0.12, 0.25, 0.08); rot(r.head, -0.45, -0.12, 0);
      rot(r.up[1], -2.85, 0, -0.35); rot(r.el[1], -0.25, 0, 0); rot(r.hand[1], -0.55, 0, 0);
      rot(r.up[0], -0.95, 0, 0.45); rot(r.el[0], -1.1, 0, 0);
      rot(r.th[0], -0.55, 0, 0.12); rot(r.kn[0], 1.25, 0, 0); rot(r.ft[0], 0.45, 0, 0);
      rot(r.th[1], 0.35, 0, -0.12); rot(r.kn[1], 0.95, 0, 0); rot(r.ft[1], 0.5, 0, 0);
      r.body.scale.set(0.96, 1.08, 0.96);
    },
    /** bloqueo: en el aire, los dos brazos rectos arriba (animate los lleva con reachTo a los objetivos: estirón), rodillas recogidas */
    block: function (r) {
      r.body.position.y = 0.45;
      rot(r.pelvis, 0.08, 0, 0); rot(r.chest, 0.06, 0, 0); rot(r.head, -0.2, 0, 0);
      rot(r.up[0], -3.0, 0, 0.2); rot(r.up[1], -3.0, 0, -0.2); rot(r.hand[0], 0.25, 0, 0); rot(r.hand[1], 0.25, 0, 0);
      rot(r.th[0], -0.35, 0, 0.1); rot(r.kn[0], 0.8, 0, 0); rot(r.ft[0], 0.3, 0, 0);
      rot(r.th[1], -0.35, 0, -0.1); rot(r.kn[1], 0.8, 0, 0); rot(r.ft[1], 0.3, 0, 0);
    },
    /** celebración: brazos en V, una rodilla arriba, cabeza atrás */
    cel: function (r) {
      rot(r.pelvis, -0.1, 0, 0); rot(r.chest, -0.1, 0, 0); rot(r.head, -0.3, 0.1, 0.1);
      rot(r.up[0], -0.25, 0, 2.5); rot(r.el[0], 0, 0, 0.45); rot(r.hand[0], 0, 0, 0.3);
      rot(r.up[1], -0.25, 0, -2.5); rot(r.el[1], 0, 0, -0.45); rot(r.hand[1], 0, 0, -0.3);
      rot(r.th[0], -1.2, 0, 0.1); rot(r.kn[0], 1.5, 0, 0); rot(r.ft[0], 0.3, 0, 0);
      rot(r.th[1], 0.05, 0, -0.08); rot(r.ft[1], -0.05, 0, 0.08);
    }
  };
  // ---- Ganchos de squash & stretch (escalas de huesos; la fase 2 los llamará desde players.js) ----
  /** Estira (a > 0) o aplasta (a < 0) el cuerpo entero desde el suelo (hueso body): volumen casi constante. */
  function squash(r, a) { var sy = 1 + a, sx = 1 / Math.sqrt(sy); r.body.scale.set(sx, sy, sx); }
  /** Estirón del brazo k: brazo + antebrazo se alargan ×s desde el hombro (escala y del hueso del brazo) y adelgazan (volumen,
   *  ×1/√s); la bola del codo se desplaza con él; la MANO recupera su tamaño (escala inversa en el hueso de la mano). s = 1: reposo. */
  function stretchArm(r, k, s) {
    var q = Math.sqrt(s);
    r.up[k].scale.set(1 / q, s, 1 / q);
    r.hand[k].scale.set(q, 1 / s, q);
  }
  var DOWN = null, QA = null, TMP2 = null;
  /** IK de un hueso con estirón cartoon (gancho para la fase 2): lleva el centro de la PALMA del brazo k al punto `tw` (mundo) con el
   *  brazo recto apuntando a él. Si queda fuera del alcance de reposo, brazo + antebrazo se alargan lo que haga falta (tope r.D.STRETCH,
   *  que cubre el alcance del atleta). `w` (0..1, por defecto 1) = peso del estirón (0 = largo de reposo; valores < 0 lo encogen un poco:
   *  anticipación, mínimo ×0,9); `blend` (0..1, por defecto 1) = mezcla de la orientación con la pose actual del brazo (entrada suave).
   *  Devuelve el factor de estiramiento necesario (1 = llega sin estirar; > STRETCH = no llega ni estirado). */
  function reachTo(r, k, tw, w, blend) {
    if (!DOWN) { DOWN = new THREE.Vector3(0, -1, 0); QA = new THREE.Quaternion(); TMP2 = new THREE.Vector3(); }
    if (w == null) w = 1; if (blend == null) blend = 1;
    var sh = r.sh[k], up = r.up[k], el = r.el[k];
    r.root.updateMatrixWorld(true);
    TMP2.copy(tw); sh.worldToLocal(TMP2);
    var d = TMP2.length(), armL = r.D.UPPER + r.D.FORE, need = Math.max(0.2, (d - r.D.PALM) / armL);
    var sN = clamp(need, 1, r.D.STRETCH), s = Math.max(0.9, 1 + (sN - 1) * w);
    if (d > 1e-4) {
      TMP2.multiplyScalar(1 / d); QA.setFromUnitVectors(DOWN, TMP2);
      if (blend >= 1) up.quaternion.copy(QA); else up.quaternion.slerp(QA, blend);
      el.rotation.x *= 1 - blend; el.rotation.z *= 1 - blend;
    }
    stretchArm(r, k, s);
    return need;
  }
  /** Rebote de la cabeza (sube/baja y se inclina sin cuello: solo el hueso head). */
  function headBob(r, dy, pitch) { r.head.position.y = r.D.NECK_Y + dy; r.head.rotation.x += pitch || 0; }

  /** Bucle sencillo de la maqueta: cada muñeco repite su pose con vida (respiración, rebote de la cabeza, estirón, aplastamiento). */
  function animate(r, t) {
    resetPose(r);
    var P = POSES[r.pose] || POSES.idle; P(r);
    var w;
    switch (r.pose) {
      case 'idle':   // respiración + rebote de la cabeza al compás + el balón sube y baja con la mano
        w = Math.sin(t * 2.2);
        r.chest.scale.set(1 + 0.012 * w, 1 + 0.02 * w, 1 + 0.012 * w);
        headBob(r, 0.008 * Math.sin(t * 2.2 + 0.6), 0.03 * Math.sin(t * 2.2 + 0.6));
        r.el[1].rotation.x += 0.06 * Math.sin(t * 2.2 - 0.4);
        break;
      case 'recv':   // balanceo lateral del peso y cabeza que sigue al balón
        w = Math.sin(t * 1.7);
        r.pelvis.position.x = 0.03 * w; r.pelvis.rotation.z = -0.05 * w; r.head.rotation.y = 0.12 * w;
        headBob(r, 0.004 * Math.sin(t * 3.4), 0);
        break;
      case 'spike': {   // ciclo de 1,9 s: carrera (abajo, aplastado) → impulso (estirado) → golpe (estirón del brazo) → aterrizaje (aplastado) → rebote
        var T = (t % 1.9) / 1.9, air = sstep(0.1, 0.22, T) * (1 - sstep(0.62, 0.74, T)), h = Math.sin(clamp((T - 0.14) / 0.56, 0, 1) * PI);
        r.body.position.y = 0.78 * h;
        var a = 0;
        if (T < 0.14) a = -0.12 * Math.sin(T / 0.14 * PI);                         // anticipación: aplastado antes de saltar
        else if (T < 0.3) a = 0.1 * Math.sin((T - 0.14) / 0.16 * PI);              // despegue: estirado
        else if (T > 0.68 && T < 0.86) a = -0.14 * Math.sin((T - 0.68) / 0.18 * PI); // aterrizaje: aplastado
        else if (T >= 0.86) a = 0.03 * Math.sin((T - 0.86) / 0.14 * PI);           // rebote
        squash(r, a);
        r.up[1].rotation.x = lerp(-1.6, -2.85, sstep(0.18, 0.4, T)) + 0.5 * sstep(0.44, 0.6, T);   // armado → golpe → acompañamiento
        r.hand[1].rotation.x = -0.55 + 0.9 * sstep(0.42, 0.52, T);
        // ESTIRÓN cartoon (reachTo): el balón está a la altura del alcance del atleta sobre el salto (fuera del brazo corto de reposo).
        // Anticipación: el brazo se ENCOGE un poco (w < 0) justo antes; estirón en pocos fotogramas hasta el golpe; vuelve al soltar.
        var hitT = 0.42, ws = T < 0.3 ? 0 : T < 0.37 ? -0.3 * Math.sin((T - 0.3) / 0.07 * PI) : T < hitT ? sstep(0.37, hitT, T) : T < 0.48 ? 1 : 1 - sstep(0.48, 0.6, T);
        var bl = sstep(0.3, hitT, T) * (1 - sstep(0.5, 0.62, T));
        TMP.set(-r.D.SH_X - 0.1, 0.78 + r.D.reach - 0.03, 0.22); r.root.localToWorld(TMP);   // objetivo: palma a reach m sobre los pies, en el vértice del salto
        if (bl > 0) reachTo(r, 1, TMP, ws, bl);
        if (r.ball) {   // el balón del remate: llega, se golpea en hitT y sale disparado
          r.ball.visible = T > 0.26 && T < 0.64;
          if (r.ball.visible) { r.root.worldToLocal(r.ball.position.copy(TMP)); if (T < hitT) r.ball.position.y += 0.9 * (hitT - T) / 0.16; else { r.ball.position.z += 7 * (T - hitT); r.ball.position.y -= 3.5 * (T - hitT); } }
        }
        // en el suelo: piernas de carrera/caída en vez de recogidas
        var gnd = 1 - air;
        if (gnd > 0) { for (var k = 0; k < 2; k++) { r.th[k].rotation.x *= air; r.kn[k].rotation.x = r.kn[k].rotation.x * air + 0.9 * gnd * (T < 0.14 || T > 0.68 ? 1 : 0); r.ft[k].rotation.x *= air; } r.pelvis.position.y = r.D.HIP_H - 0.18 * r.D.LEG * gnd * (T < 0.14 || T > 0.68 ? 1 : 0); }
        headBob(r, -0.01 * a * 4, -0.12 * Math.max(0, ws));
        r.body.scale.y *= 1;   // (ya en squash)
        break; }
      case 'cel': {   // saltitos de alegría: parábola, brazos que bombean, aplastamiento al caer y rebote de la cabeza
        var Tc = (t % 1.1) / 1.1, hc = Math.sin(clamp((Tc - 0.1) / 0.5, 0, 1) * PI);
        r.body.position.y = 0.32 * hc;
        var ac = 0;
        if (Tc < 0.1) ac = -0.1 * Math.sin(Tc / 0.1 * PI); else if (Tc < 0.22) ac = 0.07 * Math.sin((Tc - 0.1) / 0.12 * PI);
        else if (Tc > 0.6 && Tc < 0.78) ac = -0.13 * Math.sin((Tc - 0.6) / 0.18 * PI); else if (Tc >= 0.78) ac = 0.03 * Math.sin((Tc - 0.78) / 0.22 * PI);
        squash(r, ac);
        var pump = Math.sin(Tc * 2 * PI);
        r.up[0].rotation.z += 0.25 * pump; r.up[1].rotation.z -= 0.25 * pump; r.el[0].rotation.z = 0.45 + 0.3 * pump; r.el[1].rotation.z = -0.45 - 0.3 * pump;
        var kneeUp = sstep(0.1, 0.3, Tc) * (1 - sstep(0.55, 0.7, Tc));
        r.th[0].rotation.x = -1.2 * kneeUp; r.kn[0].rotation.x = 1.5 * kneeUp; r.ft[0].rotation.x = 0.3 * kneeUp;
        if (kneeUp < 1) { var kb = (1 - kneeUp) * (Tc < 0.12 || Tc > 0.6 ? 1 : 0); r.kn[0].rotation.x += 0.8 * kb; r.kn[1].rotation.x = 0.8 * kb; r.th[0].rotation.x -= 0.4 * kb; r.th[1].rotation.x = -0.4 * kb; }
        headBob(r, -0.02 * ac * 3 + 0.01 * pump, 0.06 * pump);
        break; }
      case 'block': {   // ciclo de 1,6 s: agachado → salto con los brazos que se estiran hacia la cinta → aterrizaje
        var Tb = (t % 1.6) / 1.6, hb = Math.sin(clamp((Tb - 0.12) / 0.56, 0, 1) * PI);
        r.body.position.y = 0.45 * hb;
        var ab = 0;
        if (Tb < 0.12) ab = -0.1 * Math.sin(Tb / 0.12 * PI); else if (Tb < 0.26) ab = 0.08 * Math.sin((Tb - 0.12) / 0.14 * PI);
        else if (Tb > 0.66 && Tb < 0.84) ab = -0.12 * Math.sin((Tb - 0.66) / 0.18 * PI);
        squash(r, ab);
        var wb = sstep(0.2, 0.34, Tb) * (1 - sstep(0.6, 0.72, Tb)), blb = sstep(0.12, 0.3, Tb) * (1 - sstep(0.62, 0.74, Tb));
        for (var kb2 = 0; kb2 < 2; kb2++) {
          TMP.set((kb2 ? -1 : 1) * 0.24, 0.45 + r.D.reach - 0.05, 0.28); r.root.localToWorld(TMP);   // manos a reach m sobre los pies del vértice, por encima de la cinta
          if (blb > 0) reachTo(r, kb2, TMP, wb, blb);
          else { rot(r.up[kb2], -0.6 - 0.4 * Math.sin(Tb * PI), 0, (kb2 ? -1 : 1) * 0.25); rot(r.el[kb2], -0.9, 0, 0); }
        }
        var gb = Tb < 0.12 || Tb > 0.66 ? 1 : 0;
        if (gb) { for (var kb3 = 0; kb3 < 2; kb3++) { r.th[kb3].rotation.x = -0.5; r.kn[kb3].rotation.x = 1.0; r.ft[kb3].rotation.x = -0.5; } r.pelvis.position.y = r.D.HIP_H - 0.2 * r.D.LEG; }
        headBob(r, -0.015 * ab * 3, 0);
        break; }
    }
    // el balón va en la mano derecha del que está en reposo (apoyado en la manopla); en el remate lo mueve el bucle de arriba
    if (r.ball && r.pose !== 'spike') { r.ball.visible = r.pose === 'idle'; if (r.ball.visible) { r.root.updateMatrixWorld(true); r.hand[1].getWorldPosition(TMP); r.root.worldToLocal(TMP); r.ball.position.set(TMP.x - 0.02, TMP.y - r.D.PALM + 0.03 + BR * 0.95, TMP.z + 0.03); r.ball.rotation.y = t * 0.3; } }
  }
  var TMP = null, BR = 0.21;

  // ---------- Balón sencillo (toon + tinta) para la maqueta ----------
  function makeBall() {
    var S = 256, cv = canvas(S, S), g = cv.getContext('2d'), cols = ['#1cc4b4', '#fffaf0', '#0b8a86'];
    for (var i = 0; i < 3; i++) { g.fillStyle = cols[i]; g.fillRect(i * S / 3, 0, S / 3 + 1, S); }
    g.fillStyle = 'rgba(29,21,48,0.8)'; g.fillRect(S / 3 - 3, 0, 6, S); g.fillRect(2 * S / 3 - 3, 0, 6, S); g.fillRect(0, 0, S, 5); g.fillRect(0, S - 5, S, 5);
    var t = texOf(cv), m = VB.TOON && VB.TOON.toonMat ? VB.TOON.toonMat({ map: t }) : new THREE.MeshToonMaterial({ map: t });
    var b = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), m); b.name = 'dollBall'; b.castShadow = true;
    if (VB.TOON && VB.TOON.outline) VB.TOON.outline(b, OUT_MIN, { max: OUT_MAX, k: VB.TOON.px ? OUT_PX / VB.TOON.px : 1 });
    return b;
  }

  // =====================================================================
  //  ESCENA DE DEPURACIÓN ?debug=doll
  // =====================================================================
  var rigs = [], group = null, on = false, view = 'fila', tAnim = 0, hidden = [], styleEl = null, camSet = null, lodNow = 2;
  // ?debug=doll&scrim=1: la maqueta con los petos del partidillo (equipaciones de VB.Players con st.scrim; &shirt=RRGGBB = color del
  // club, rojo si falta); &map=beach la viste de playa. DBG_TC / DBG_BEACH los lee buildRig cuando no le pasan opt.tc / opt.beach.
  var DBG_TC = null, DBG_BEACH = false;
  var VIEWS = {
    // posiciones en coords de la SIM (x largo, y ancho), yaw de la sim (0 = mira a +x, hacia la cámara), cámara en Three.
    // Las alturas (y de cam/at) están pensadas para v1 (cabeza a 1,65, 1,86 de pie): applyCamera las escala con el cuerpo activo
    // (cuerpo entero: × alto/1,86; `face`: desplazadas con el centro de la cabeza); `fixed` no se toca (comparación antes/después).
    fila: { pos: [[3, -1.65], [3, -0.55], [3, 0.55], [3, 1.65]], yaw: [0, 0, 0, 0], cam: [7.4, 1.5, 0], at: [3, 1.2, 0], fov: 40 },
    poses: { pos: [[3, -1.8], [3, -0.6], [3, 0.6], [3, 1.8]], yaw: [0.5, 0.5, 0.5, 0.5], cam: [6.9, 2.7, 3.1], at: [3, 1.45, 0.1], fov: 46 },
    cara: { pos: [[3, -0.62], [3, 0], [3, 0.62]], yaw: [0, 0, 0], cam: [5.3, 1.66, 0], at: [3, 1.63, 0], fov: 30, faces: ['neutra', 'alegria', 'esfuerzo'], poses: ['stand', 'stand', 'stand'], face: true },
    cuerpo: { pos: [[3, -1.25], [3, 0], [3, 1.25]], yaw: [0, 0.78, PI], cam: [7.4, 1.25, 0], at: [3, 0.95, 0], fov: 32, poses: ['stand', 'stand', 'stand'] },
    // los otros peinados (rehace los tres primeros muñecos sin complemento): flequillo, rapado, trenzas + moño
    peinados: { pos: [[3, -1.05], [3, -0.35], [3, 0.35], [3, 1.05]], yaw: [0.25, 0.25, 0.25, 0.25], cam: [6.1, 1.75, 0.5], at: [3, 1.45, 0], fov: 32, poses: ['stand', 'stand', 'stand', 'stand'], faces: ['neutra', 'sorpresa', 'pena', 'lengua'], restyle: [['flequillo', ''], ['rapado', ''], ['trenzas', ''], ['mono', '']], face: true },
    // un solo muñeco de pie con cámara FIJA (misma para v1 y chibi): hoja antes/después
    solo: { pos: [[3, 0]], yaw: [0.12], cam: [7.2, 1.15, 0], at: [3, 0.98, 0], fov: 30, poses: ['stand'], faces: ['neutra'], fixed: true },
    // estirón del remate (el rematador solo, 3/4, cámara fija: 4 fotogramas con freeze) y bloqueo (dos muñecos)
    estiron: { pos: [null, null, [3, 0]], yaw: [0, 0, 0.55], cam: [6.7, 2.0, 2.3], at: [3, 1.65, 0.1], fov: 48, fixed: true },
    bloqueo: { pos: [null, null, [3, -0.55], [3, 0.55]], yaw: [0, 0, 0.3, 0.3], cam: [6.9, 1.9, 1.6], at: [3, 1.75, 0], fov: 44, poses: [null, null, 'block', 'block'], faces: [null, null, 'concentrado', 'esfuerzo'], fixed: true }
  };
  function viewY(V, y) {
    if (V.fixed) return y;
    var top = SH_H + HEAD_C + HEAD_RY, hc = SH_H + HEAD_C;
    return V.face ? y + (hc - 1.65) : y * top / 1.86;
  }
  POSES.stand = function (r) {   // de pie, neutro (hoja de cuerpo)
    rot(r.up[0], -0.05, 0, 0.12); rot(r.up[1], -0.05, 0, -0.12); rot(r.el[0], -0.15, 0, 0); rot(r.el[1], -0.15, 0, 0);
    rot(r.th[0], 0, 0, 0.05); rot(r.th[1], 0, 0, -0.05); rot(r.ft[0], 0, 0, -0.05); rot(r.ft[1], 0, 0, 0.05);
  };
  function hideObj(o) { if (o && o.visible) { o.visible = false; hidden.push(o); } }
  function hideGame() {
    if (!ctx || !ctx.scene) return;
    hideObj(ctx.scene.getObjectByName('players'));
    hideObj(ctx.scene.getObjectByName('contactBlobs'));
    try { if (VB.FX && VB.FX.ballObject) hideObj(VB.FX.ballObject()); } catch (e) { }
  }
  function placeView(name) {
    var V = VIEWS[name] || VIEWS.fila; view = VIEWS[name] ? name : 'fila';
    if (V.restyle) for (var k = 0; k < V.restyle.length; k++) if (rigs[k] && (rigs[k].look.style !== V.restyle[k][0] || rigs[k].look.acc !== V.restyle[k][1])) VB.Doll.restyle(k, V.restyle[k][0], V.restyle[k][1]);
    for (var i = 0; i < rigs.length; i++) {
      var r = rigs[i], p = V.pos[i];
      r.root.visible = !!p;
      if (!p) continue;
      r.root.position.set(p[0], 0, -p[1]);
      var yaw = V.yaw[i] || 0; r.root.rotation.y = Math.atan2(Math.cos(yaw), -Math.sin(yaw));
      r.pose = V.poses && V.poses[i] ? V.poses[i] : r.look.pose;
      setFace(r, V.faces && V.faces[i] ? V.faces[i] : r.look.face);
    }
    camSet = V;
  }
  function applyCamera() {
    var cam = ctx && ctx.camera, V = camSet; if (!cam || !V) return;
    cam.position.set(V.cam[0], viewY(V, V.cam[1]), V.cam[2]); cam.up.set(0, 1, 0); cam.lookAt(V.at[0], viewY(V, V.at[1]), V.at[2]);
    if (cam.fov !== V.fov) { cam.fov = V.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
  }
  function reachInfo() {
    var d = null; try { d = VB.Players && VB.Players.dims ? VB.Players.dims() : null; } catch (e) { }
    // `athlete` = alcance ESTIRADO del rig del juego (VB.Players.dims().reachMax; `reach` es el de reposo desde la fase 2)
    return { body: BODY, doll: +REACH.toFixed(4), rest: +REACH_REST.toFixed(4), stretch: +STRETCH_MAX.toFixed(3), athlete: d ? +(d.reachMax != null ? d.reachMax : d.reach).toFixed(4) : null, shoulder: +SH_H.toFixed(3), upper: +UPPER.toFixed(4), fore: +FORE.toFixed(4), palm: PALM, hip: +HIP_H.toFixed(3), head: +(2 * HEAD_RY).toFixed(3), headW: +(2 * HEAD_RX).toFixed(3), headTop: +(SH_H + HEAD_C + HEAD_RY).toFixed(3), heads: +((SH_H + HEAD_C + HEAD_RY) / (2 * HEAD_RY)).toFixed(2), handLow: +(SH_H - UPPER - FORE - PALM - 0.06 * HAND_K).toFixed(3) };
  }

  /** Libera todo lo de GPU de un muñeco de doll.js (atlas, material, mallas de los LOD, textura de huesos y contorno) y lo saca de
   *  la escena. El material del contorno es compartido (VB.TOON, uno por color): no se libera. */
  function freeRig(r) {
    if (!r) return;
    if (r.root && r.root.parent) r.root.parent.remove(r.root);
    if (r.ink) { if (VB.TOON && VB.TOON.drop) VB.TOON.drop(r.ink); else if (r.ink.parent) r.ink.parent.remove(r.ink); r.ink = null; }
    try { var m = r.skin && r.skin.material; if (m) { if (m.map) m.map.dispose(); m.dispose(); } } catch (e) { }
    try { for (var i = 0; i < r.geos.length; i++) if (r.geos[i]) { r.geos[i].dispose(); r.geos[i] = null; } } catch (e) { }
    try { if (r.skin && r.skin.skeleton) r.skin.skeleton.dispose(); } catch (e) { }
  }

  // =====================================================================
  //  VISTA PREVIA DEL VESTUARIO (VB.Doll.preview; spec «Vestuario» §4.5)
  // =====================================================================
  // Un muñeco de muestra en ctx.scene, en la sede actual (three (5, 0, 0), mirando a la cámara), con el mismo renderer, luces y
  // programas que el juego (cero programas nuevos: 'vbDollToon' y la tinta de VB.TOON). main.js lo enciende con
  // ctx.actions.showroom (los atletas los oculta Players.showroom) y llama a update() después de CameraRig.update: aquí se anima y
  // se coloca ctx.camera. Un solo LOD (el de la calidad activa); set() solo rehace la malla si cambia geoSig (o la sede, o el lienzo):
  // si solo cambia el atlas, repinta el mismo lienzo. Al rehacer libera lo viejo (freeRig).
  var PV = null, PV_POS = [5, 0, 0], PV_FOV = 46;
  // ENCUADRES (WP6 del plan del Vestuario): cada uno es una CAJA del muñeco, medida en sus huesos de pie (pvMeasure, en metros del
  // muñeco sin la escala de altura): lo (abajo), hi (arriba), lat (medio ancho), up (altura de la cámara sobre el centro, × distancia),
  // fill (parte del alto libre que ocupa: los de cerca, menos; y nunca más de PV_PPM píxeles CSS por metro: en PC no sale gigante),
  // yaw (giro con el que se enseña: 0 = de frente; −π/2 = su lado izquierdo a cámara) y, si va, peek (giro al que se asoma un momento y
  // vuelve: la coleta y el moño se ven de espaldas). La cámara se aleja hasta que la caja cabe en el hueco libre que da la UI (place:
  // centro y medio ancho a lo ancho, franjas tapadas arriba y abajo) y se desplaza de lado para centrarla en él. Así el mismo encuadre
  // vale en apaisado, en vertical y en PC. frame(nombre) va a uno con transición (≈300 ms) y frameSlot(ranura) elige el de esa ranura.
  var PV_PPM = 340, PV_MINPX = 230;   // (lo pequeño, como los pies, puede salir algo más de cerca: hasta 230 px de alto)
  var PV_FRAMES = {
    cuerpo: function (m) { return { lo: -0.04, hi: m.top + 0.14, lat: SH_X + 0.2, up: 0.1, yaw: 0 }; },
    cabeza: function (m) { return { lo: m.chin - 0.24, hi: m.top + 0.12, lat: HEAD_RX + 0.2, up: 0.03, yaw: 0.55, fill: 0.86 }; },
    nuca: function (m) { return { lo: m.chin - 0.24, hi: m.top + 0.12, lat: HEAD_RX + 0.2, up: 0.06, yaw: 0.55, peek: 2.75, fill: 0.86 }; },
    perfil: function (m) { return { lo: m.chin - 0.24, hi: m.top + 0.14, lat: HEAD_RX + 0.32, up: 0.03, yaw: 1.05, fill: 0.86 }; },
    cara: function (m) { return { lo: m.chin - 0.06, hi: m.head + HEAD_RY + 0.06, lat: HEAD_RX + 0.08, up: 0, yaw: 0.12, fill: 0.8 }; },
    torso: function (m) { return { lo: m.hip - 0.16, hi: m.top + 0.12, lat: SH_X + 0.2, up: 0.08, yaw: 0.3 }; },
    brazos: function (m) { return { lo: m.hand - 0.14, hi: m.top + 0.1, lat: SH_X + 0.22, up: 0.06, yaw: 0 }; },
    brazoL: function (m) { return { lo: m.hand - 0.14, hi: m.top + 0.1, lat: 0.36, up: 0.06, yaw: -1.05 }; },
    brazoR: function (m) { return { lo: m.hand - 0.14, hi: m.top + 0.1, lat: 0.36, up: 0.06, yaw: 1.05 }; },
    manos: function (m) { return { lo: m.hand - 0.14, hi: m.el + 0.1, lat: SH_X + 0.22, up: 0.1, yaw: 0.35, fill: 0.86 }; },
    piernas: function (m) { return { lo: -0.05, hi: m.hip + 0.16, lat: HIP_W + 0.26, up: 0.12, yaw: 0.3 }; },
    rodillas: function (m) { return { lo: m.knee - 0.24, hi: m.knee + 0.24, lat: HIP_W + 0.22, up: 0.1, yaw: 0.4, fill: 0.86 }; },
    pies: function (m) { return { lo: -0.05, hi: m.ankle + 0.18, lat: HIP_W + 0.13, up: 0.3, yaw: 0.6, fill: 0.86 }; }
  };
  // ranura (o fila de la UI) → encuadre. Lo que no está aquí, 'cuerpo'. Los colores van a lo que pintan (WP1: VB.Look.uses)
  var PV_SLOT = {
    style: 'cabeza', hair: 'nuca', hair2: 'nuca', hairFx: 'cabeza', head: 'perfil', eyes: 'cara', paint: 'cara', marks: 'cara', beard: 'cara',
    neck: 'torso', under: 'torso', band: 'brazoL', armL: 'brazoL', armR: 'brazoR', elbows: 'brazos', wristL: 'brazoL', wristR: 'brazoR',
    hands: 'manos', legs: 'piernas', knees: 'rodillas', socks: 'piernas', ankle: 'pies', shoes: 'pies',
    'c:sock': 'piernas', 'c:shoe': 'pies', 'c:glass': 'cara', 'c:pad': 'rodillas'
  };
  /** Alturas del muñeco de pie (pelvis, hombro, codo, mano, rodilla, tobillo, centro de la cabeza, barbilla y lo más alto con pelo o
   *  gorro), en metros del muñeco. Una vez por malla (r._pvM), con la pose 'stand' del momento y la de antes devuelta. */
  function pvMeasure(r) {
    if (r._pvM) return r._pvM;
    if (!TMP) TMP = new THREE.Vector3();
    var v = TMP, p0 = r.pose, m = {};
    function y(b, dy) { v.set(0, dy || 0, 0); b.localToWorld(v); r.root.worldToLocal(v); return v.y; }
    r.pose = 'stand'; animate(r, 0); r.root.updateMatrixWorld(true);
    m.hip = y(r.pelvis); m.sh = (y(r.sh[0]) + y(r.sh[1])) / 2; m.el = (y(r.el[0]) + y(r.el[1])) / 2;
    m.hand = Math.min(y(r.hand[0], -PALM), y(r.hand[1], -PALM)); m.knee = (y(r.kn[0]) + y(r.kn[1])) / 2; m.ankle = (y(r.ft[0]) + y(r.ft[1])) / 2;
    m.head = y(r.head, HEAD_C); m.chin = m.head - HEAD_RY; m.top = y(r.head, HEAD_C + HEAD_RY + 0.1);
    r.pose = p0; animate(r, r.tFix >= 0 ? r.tFix : PV ? PV.t : 0); r.root.updateMatrixWorld(true);
    r._pvM = m;
    return m;
  }
  /** Ángulo a de vuelta al tramo (b − π, b + π]: para girar siempre por el camino corto. */
  function pvNear(a, b) { var T = PI * 2; return a - T * Math.round((a - b) / T); }
  function pvKit(o, prev) {
    if (o && o.tc) return o.tc;
    if (prev && prev.tc) return prev.tc;
    try { if (VB.Players && VB.Players.kit) { var k = VB.Players.kit(0); if (k && k.base != null) return k; } } catch (e) { }
    return TEAMS[0];
  }
  function pvBeach(o, prev) {
    if (o && o.beach != null) return !!o.beach;
    if (prev) return prev.beach;
    try { if (VB.Arena && VB.Arena.venue) return VB.Arena.venue() === 'beach'; } catch (e) { }
    return false;
  }
  /** Opciones completas de la vista previa: lo que no llega se queda como estaba (o el kit de tu equipo, la sede actual, dorsal 1). */
  function pvOpts(o, prev) {
    o = o || {};
    return { tc: pvKit(o, prev), num: o.num != null ? o.num : prev ? prev.num : 1, beach: pvBeach(o, prev), px: o.px != null ? (o.px === 1 ? 1 : 2) : prev ? prev.px : 2 };
  }
  // la vista previa del Vestuario va SIEMPRE en la malla alta (WP1 del plan del Vestuario): es un solo muñeco y es justo donde se mira
  // el detalle; con la calidad activa, el móvil (calidad media) veía la malla media facetada (casquetes del pelo, zapatillas)
  // PV_LOD: nivel forzado SOLO para herramientas (tools/lookvis.js mide el partido en LOD1 y LOD0 con la vista previa); el juego
  // nunca lo toca. null = LOD2
  var PV_LOD = null;
  function pvLod() { return PV_LOD != null ? PV_LOD : 2; }
  function pvHide() {
    if (!ctx || !ctx.scene) return;
    var list = [ctx.scene.getObjectByName('contactBlobs')];
    try { if (VB.FX && VB.FX.ballObject) list.push(VB.FX.ballObject()); } catch (e) { }
    if (!(VB.Players && VB.Players.showroom)) list.push(ctx.scene.getObjectByName('players'));   // sin showroom de players, se ocultan aquí
    for (var i = 0; i < list.length; i++) { var o = list[i]; if (o && o.visible) { o.visible = false; if (PV.hidden.indexOf(o) < 0) PV.hidden.push(o); } }
  }
  function pvBuild(L, op) {
    var r = buildRig(L, 90, { tc: op.tc, num: op.num, beach: op.beach, px: op.px, lod: PV.lod });
    r.root.name = 'dollPreview'; r.root.position.set(PV_POS[0], PV_POS[1], PV_POS[2]);
    // sin recibir sombras: el mapa de sombras de la pista está pensado para la cámara de partido y, a 1,85 m (y peor en calidad
    // media, la del móvil), salía a escalones sobre la cara y la camiseta. Es un uniform: no cambia de programa. Sigue dando sombra
    r.skin.receiveShadow = false;
    var h = typeof L.h === 'number' && L.h > 0.5 && L.h < 1.5 ? L.h : 1; r.root.scale.setScalar(h);
    r.pose = PV.pose; setFace(r, PV.face); r.blinkT = 2;
    ctx.scene.add(r.root);
    return r;
  }
  // periodo (s) de la animación de cada pose de «Probar» (animate): pvEnv la recorre entera para medir hasta dónde llega
  var PV_CYCLE = { spike: 1.9, cel: 1.1, recv: 3.7, idle: 2.86, block: 1 };
  /** Caja de la pose animada en curso, en metros del muñeco (sin la escala de altura): {lo, hi, lat} = pies, lo más alto (manos,
   *  cabeza con gorro o peinado) y lo más lejos del eje vertical (brazos abiertos). Recorre un ciclo entero de animate (el remate
   *  salta 0,78 m y estira el brazo: con el encuadre 'cuerpo' fijo, la cabeza y la mano se salían por arriba y por la derecha). */
  function pvEnv(r) {
    // rlo / rhi: lo mismo respecto a la pelvis de ese momento (WP6: «Probar» encuadra el cuerpo a su tamaño y la cámara sigue el salto)
    var T = PV_CYCLE[r.pose] || 2, N = 32, v = TMP, e = { lo: 1e9, hi: -1e9, lat: 0, rlo: 1e9, rhi: -1e9 }, i, k, py = 0;
    function pt(b, y, rad) {
      v.set(0, y, 0); b.localToWorld(v); r.root.worldToLocal(v);
      e.lo = Math.min(e.lo, v.y - rad); e.hi = Math.max(e.hi, v.y + rad); e.lat = Math.max(e.lat, Math.sqrt(v.x * v.x + v.z * v.z) + rad);
      e.rlo = Math.min(e.rlo, v.y - rad - py); e.rhi = Math.max(e.rhi, v.y + rad - py);
    }
    for (i = 0; i < N; i++) {
      animate(r, T * i / N); r.root.updateMatrixWorld(true);
      v.set(0, 0, 0); r.pelvis.localToWorld(v); r.root.worldToLocal(v); py = v.y;
      pt(r.head, HEAD_C, HEAD_RX + 0.06); pt(r.head, HEAD_C + HEAD_RY + 0.08, 0.02);   // la cabeza y lo que lleve encima
      for (k = 0; k < 2; k++) { pt(r.el[k], 0, 0.08); pt(r.hand[k], -PALM, 0.09); pt(r.ft[k], 0, 0.06); pt(r.ft[k], -ANKLE, 0.03); }
    }
    e.lo = Math.min(e.lo, 0);   // los pies siempre en el suelo (o por encima)
    return e;
  }
  var preview = {
    /** Enciende la vista previa con el aspecto L (VB.Look.resolve, o una L vieja) y o = {tc, num, beach, px}. */
    start: function (c, L, o) {
      if (PV) this.stop();
      ctx = c; THREE = (c && c.THREE) || window.THREE; if (!TMP) TMP = new THREE.Vector3(); if (VB.C && VB.C.BR) BR = VB.C.BR;
      if (!ctx || !ctx.scene) return false;
      L = Object.freeze(Object.assign({}, L || {}));
      var op = pvOpts(o, null);
      // yaw = giro del dedo (arrastre, ⟲ ⟳, stick, giro solo); yawB = giro del encuadre, que va con suavidad a yawT (frameSlot, turn);
      // peekT = segundos que quedan asomado a la espalda (peek) antes de volver; sx/sy = desplazamiento suave de la cámara
      PV = { r: null, L: L, o: op, gs: geoSig(L, op.tc, op.beach), as: atlasSig(L, op.tc, op.num, op.beach), lod: pvLod(), hidden: [], yaw: 0, t: 0,
        yawB: 0, yawT: 0, peek: 0, peekT: 0, slot: '', fl: 0, flL: null,
        pose: 'stand', face: 'neutra', frame: 'cuerpo', cx: 0.68, half: 0, top: 0, bot: 0, cy: 0, cd: 0, sx: 0, sy: 0, snap: true,
        fov0: ctx.camera ? ctx.camera.fov : 0, film0: ctx.camera ? ctx.camera.filmOffset || 0 : 0 };
      PV.r = pvBuild(L, op);
      pvHide();
      return true;
    },
    /** Cambia el aspecto (y, si llegan, las opciones). Devuelve 'geo' si rehízo la malla (main avisa a la calidad adaptativa),
     *  'atlas' si solo repintó el lienzo y '' si no había nada que cambiar. */
    set: function (L, o) {
      if (!PV) return '';
      L = Object.freeze(Object.assign({}, L || {}));
      var op = pvOpts(o, PV.o), gs = geoSig(L, op.tc, op.beach), as = atlasSig(L, op.tc, op.num, op.beach), old = PV.r;
      if (gs !== PV.gs || op.beach !== PV.o.beach || op.px !== PV.o.px || pvLod() !== PV.lod) {
        PV.lod = pvLod(); PV.L = L; PV.o = op; PV.gs = gs; PV.as = as;
        var n = pvBuild(L, op);
        n.tFix = old.tFix; PV.r = n; PV.env = null; freeRig(old);
        return 'geo';
      }
      PV.L = L; PV.o = op;
      if (as === PV.as) return '';
      PV.as = as;
      var m = old.skin.material, cv = m.map && m.map.image;
      old.look = L; old.tc = op.tc; old.num = op.num;
      m.userData.paint = { tc: op.tc, L: L, num: op.num, beach: op.beach };
      paintAtlas(cv, op.tc, L, op.num, op.beach); m.map.needsUpdate = true;
      return 'atlas';
    },
    /** SOLO herramientas: fuerza el nivel de detalle de la vista previa (0, 1 o 2; otra cosa lo quita y vuelve a LOD2). Se aplica
     *  en el próximo start/set (rehace la malla). Devuelve el nivel que queda. */
    lod: function (n) { PV_LOD = n === 0 || n === 1 || n === 2 ? n : null; return pvLod(); },
    /** Pose del muñeco: 'idle' | 'spike' | 'cel' | 'recv' (y 'block', 'stand'). */
    pose: function (name) { if (!PV || !POSES[name]) return false; PV.pose = PV.r.pose = name; PV.env = null; return name; },
    /** Expresión: neutra | concentrado | esfuerzo | grito | alegria | pena | sorpresa | lengua. */
    face: function (expr) { if (!PV) return false; PV.face = EXPR[expr] ? expr : 'neutra'; setFace(PV.r, PV.face); return PV.face; },
    /** Gira el muñeco dRad (arrastre, botones ⟲ ⟳, stick derecho). Corta el asomo a la espalda (peek) si lo había. */
    spin: function (d) { if (!PV) return 0; PV.peekT = 0; PV.yaw = (PV.yaw + (+d || 0)) % (PI * 2); return PV.yaw + PV.yawB; },
    /** Fija el giro del muñeco (0 = de frente), al momento y sin el giro del encuadre (herramientas: yaw(π) = de espaldas). */
    yaw: function (rad) { if (!PV) return 0; PV.yaw = (+rad || 0) % (PI * 2); PV.yawB = PV.yawT = 0; PV.peekT = 0; return PV.yaw; },
    /** Da la vuelta (180°) con giro animado (botón «Dar la vuelta» del Vestuario). Devuelve el giro al que va. */
    turn: function () {
      if (!PV) return 0;
      PV.peekT = 0; PV.yawB += PV.yaw; PV.yaw = 0; PV.yawT = pvNear(PV.yawT, PV.yawB) + PI;
      return PV.yawT;
    },
    /** Hueco libre donde va el muñeco (fracciones de la ventana): cx = centro a lo ancho, half = medio ancho del hueco (0 = hasta el
     *  borde más cercano), top / bot = franjas tapadas por la UI arriba y abajo. Vale en apaisado y en vertical: la cámara se aleja
     *  hasta que la caja del encuadre cabe en ese hueco y se desplaza de lado (no gira) para centrarla en él. */
    place: function (cx, half, top, bot) {
      if (!PV) return 0; cx = +cx; PV.cx = cx > 0.2 && cx < 0.95 ? cx : 0.68;
      half = +half; PV.half = half > 0.02 && half <= 0.5 ? half : 0;
      top = +top; PV.top = top > 0 && top < 0.8 ? top : 0;
      bot = +bot; PV.bot = bot > 0 && bot < 0.8 ? bot : 0;
      if (PV.top + PV.bot > 0.85) { var k = 0.85 / (PV.top + PV.bot); PV.top *= k; PV.bot *= k; }
      PV.placed = true;
      return PV.cx;
    },
    /** Encuadre por nombre (PV_FRAMES: cuerpo, cabeza, nuca, perfil, cara, torso, brazos, brazoL, brazoR, manos, piernas, rodillas,
     *  pies). La cámara va hasta él con suavidad; el giro NO cambia (eso es frameSlot). */
    frame: function (name) { if (!PV || !PV_FRAMES[name]) return false; PV.frame = name; return name; },
    /** Encuadre y giro de una ranura del Vestuario (PV_SLOT; los colores con 'c:clave'). o = {back: el peinado lleva volumen detrás
     *  (se asoma a la espalda ~1 s y vuelve), keep: no tocar el giro, frame: forzar un encuadre}. Pone el giro del encuadre (el del
     *  dedo vuelve a 0) y va hasta él por el camino corto en ≈300 ms. Devuelve el encuadre. */
    frameSlot: function (slot, o) {
      if (!PV) return false;
      o = o || {};
      var name = o.frame && PV_FRAMES[o.frame] ? o.frame : this.frameOf(slot, o);
      PV.frame = name; PV.slot = String(slot || '');
      if (!o.keep) {
        var b = PV_FRAMES[name](pvMeasure(PV.r));
        PV.yawB = pvNear(PV.yawB + PV.yaw, b.yaw); PV.yaw = 0; PV.yawT = b.yaw;
        PV.peek = b.peek || 0; PV.peekT = b.peek && !o.still ? 1.25 : 0;
      }
      return name;
    },
    /** Nombre del encuadre de una ranura (sin aplicarlo): lo usan las miniaturas de la rejilla del Vestuario. */
    frameOf: function (slot, o) { return slot === 'style' && o && o.back ? 'nuca' : PV_SLOT[slot] || 'cuerpo'; },
    /** Parpadeo de lo que pinta un color (el Vestuario, al cambiarlo): pinta el atlas con L2 durante s segundos (0,4 por defecto) y
     *  vuelve al aspecto de verdad. Solo si L2 cambia el atlas y no la malla (si no, nada). */
    flash: function (L2, s) {
      if (!PV || !L2) return false;
      var op = PV.o, r = PV.r; if (geoSig(L2, op.tc, op.beach) !== PV.gs || atlasSig(L2, op.tc, op.num, op.beach) === PV.as) return false;
      var m = r.skin.material, cv = m.map && m.map.image; if (!cv) return false;
      paintAtlas(cv, op.tc, L2, op.num, op.beach); m.map.needsUpdate = true;
      PV.fl = s > 0 ? s : 0.4; PV.flL = PV.as;
      return true;
    },
    /** Cada frame, después de CameraRig.update: anima, vuelve a ocultar balón y manchas y coloca ctx.camera. */
    update: function (dt) {
      if (!PV) return;
      dt = Math.min(0.05, Math.max(0, dt || 0)); PV.t += dt;
      var r = PV.r;
      animate(r, r.tFix >= 0 ? r.tFix : PV.t); blink(r, dt);
      if (r.pose === 'stand') {   // de pie con respiración (la pose 'stand' de las hojas de ?debug=doll va quieta)
        var w = Math.sin(PV.t * 2.2);
        r.chest.scale.set(1 + 0.012 * w, 1 + 0.02 * w, 1 + 0.012 * w);
        headBob(r, 0.008 * Math.sin(PV.t * 2.2 + 0.6), 0.03 * Math.sin(PV.t * 2.2 + 0.6));
      }
      // fin del parpadeo de un color: el atlas de verdad (si entretanto no se repintó por otro cambio)
      if (PV.fl > 0) {
        PV.fl -= dt;
        if (PV.fl <= 0 && PV.flL === PV.as) { var mf = r.skin.material, cvf = mf.map && mf.map.image; if (cvf) { paintAtlas(cvf, PV.o.tc, PV.L, PV.o.num, PV.o.beach); mf.map.needsUpdate = true; } }
      }
      // giro del encuadre: asomarse a la espalda un momento (peek) y volver; luego, con suavidad (≈300 ms), al giro que toca
      var yT = PV.yawT;
      if (PV.peekT > 0) { PV.peekT -= dt; yT = PV.peek; }
      PV.yawB += (pvNear(yT, PV.yawB) - PV.yawB) * (PV.snap ? 1 : 1 - Math.exp(-dt * (PV.peekT > 0 ? 6 : 9)));
      pvHide();
      var cam = ctx && ctx.camera; if (!cam) return;
      var asp = cam.aspect || 1, sc = r.root.scale.y, tq = Math.tan(PV_FOV * PI / 360), M = pvMeasure(r);
      var fn = PV.frame;
      if (PV.fbN !== fn || PV.fbR !== r) { PV.fb = (PV_FRAMES[fn] || PV_FRAMES.cuerpo)(M); PV.fbN = fn; PV.fbR = r; }   // (sin objetos nuevos por frame)
      var f = PV.fb, lo = f.lo, hi = f.hi, lat = f.lat;
      var follow = false;
      if (fn === 'cuerpo' && r.pose !== 'stand' && PV_CYCLE[r.pose]) {
        // «Probar» (U11): la caja es la del cuerpo en la pose (brazos arriba, piernas recogidas) respecto a la pelvis, y la cámara sigue
        // a la pelvis con retraso: el muñeco sale grande y el salto se nota (antes se encuadraba el ciclo entero y salía pequeño)
        if (!PV.env) { PV.env = pvEnv(r); animate(r, r.tFix >= 0 ? r.tFix : PV.t); r.root.updateMatrixWorld(true); }
        TMP.set(0, 0, 0); r.pelvis.localToWorld(TMP); r.root.worldToLocal(TMP);
        var E = PV.env, pyN = TMP.y;
        lo = pyN + E.rlo - 0.05; hi = pyN + E.rhi + 0.06; lat = Math.max(SH_X + 0.2, E.lat * 0.66); follow = true;
      }
      // hueco libre (place): a lo ancho [cx − half, cx + half] y a lo alto [top, 1 − bot]. Sin place: en apaisado a la derecha
      // (cx 0,68, hasta el borde); en vertical, la mitad de arriba
      var cx = PV.placed || asp >= 1 ? PV.cx : 0.5, half = PV.half || Math.min(cx, 1 - cx);
      var top = PV.top || 0, bot = PV.placed || asp >= 1 ? PV.bot || 0 : 0.5, fh = Math.max(0.15, 1 - top - bot);
      var ty = (lo + hi) * 0.5 * sc, hv = (hi - lo) * 0.5 * sc, hl = lat * sc;
      // distancia: que la caja quepa a lo alto y a lo ancho (con un 6 % de aire; los de cerca, f.fill del alto); nunca más cerca de
      // 0,55 m. Nunca más de PV_PPM píxeles CSS por metro del muñeco: en PC la cabeza salía de 600 px y los pies de 900
      var fill = f.fill || 0.94, Hc = (ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.clientHeight) || ctx.height || 720;
      fill = Math.min(fill, Math.max(PV_PPM * (hi - lo), PV_MINPX) / (fh * Hc));
      var d = Math.max(0.55, hv / (tq * fh * fill), hl / (tq * asp * 2 * half * 0.94));
      var k = PV.snap ? 1 : 1 - Math.exp(-dt * 10), kf = follow && !PV.snap ? 1 - Math.exp(-dt * 4) : k; PV.snap = false;
      PV.cy += (ty - PV.cy) * kf; PV.cd += (d - PV.cd) * k;
      // desplazamiento de la cámara en fracciones del cuadro (se suaviza igual: al cambiar de hueco no salta)
      PV.sx += ((cx - 0.5) - PV.sx) * k; PV.sy += ((top + fh * 0.5 - 0.5) - PV.sy) * k;
      if (cam.fov !== PV_FOV || cam.filmOffset || cam.zoom !== 1 || cam.view) {   // sin el desplazamiento de lente ni el zoom de la cámara del menú
        cam.fov = PV_FOV; cam.filmOffset = 0; cam.zoom = 1; if (cam.view && cam.clearViewOffset) cam.clearViewOffset(); cam.updateProjectionMatrix();
      }
      var px = PV_POS[0], pz = PV_POS[2], cd = PV.cd, cy = PV.cy, upk = f.up != null ? f.up : 0.1;
      cam.up.set(0, 1, 0); cam.position.set(px + cd, cy + cd * upk, pz); cam.lookAt(px, cy, pz); cam.updateMatrixWorld(true);
      var e = cam.matrixWorld.elements;
      // la cámara se DESPLAZA de lado (no gira): girada, el muñeco quedaba en el borde del cono y más cerca en profundidad, y salía
      // un 15-20 % más grande y estirado que en el centro (a 844×390 se cortaba)
      var sh = cd * tq * asp * 2 * PV.sx, su = cd * tq * 2 * PV.sy;
      var ox = -e[0] * sh + e[4] * su, oy = -e[1] * sh + e[5] * su, oz = -e[2] * sh + e[6] * su;
      cam.position.set(px + cd + ox, cy + cd * upk + oy, pz + oz); cam.lookAt(px + ox, cy + oy, pz + oz);
      r.root.rotation.y = Math.atan2(cd, oz) + PV.yaw + PV.yawB;   // de frente a la cámara desplazada (0 de giro = mirando a cámara)
      cam.updateMatrixWorld(true);
    },
    /** Apaga la vista previa: libera el muñeco, vuelve a enseñar lo que ocultó y devuelve el fov y la lente de la cámara. */
    stop: function () {
      if (!PV) return false;
      freeRig(PV.r);
      for (var i = 0; i < PV.hidden.length; i++) PV.hidden[i].visible = true;
      var cam = ctx && ctx.camera; if (cam && PV.fov0) { cam.fov = PV.fov0; cam.filmOffset = PV.film0; cam.updateProjectionMatrix(); }
      PV = null;
      return true;
    },
    active: function () { return !!PV; },
    /** Estado para pruebas: LOD, triángulos, firmas y el rig. */
    info: function () { return PV ? { lod: PV.lod, tris: triCount(PV.r.skin.geometry), geo: PV.gs, atlas: PV.as, beach: PV.o.beach, frame: PV.frame, slot: PV.slot, yaw: PV.yaw + PV.yawB, yawT: PV.yawT, cd: PV.cd, pose: PV.pose, rig: PV.r } : null; }
  };

  // =====================================================================
  //  PRUEBA DEL VESTUARIO EN EL NAVEGADOR (VB.Doll.lookSelfTest; spec §9; la usa tools/looktest.js --gl)
  // =====================================================================
  // Topes por muñeco con el look completo (§1.5) y triángulos EXACTOS de los looks de hoy [LOD0, LOD1, LOD2] (pista).
  // TRI_CAP es para el partido: hay 12 muñecos en el 6v6 del móvil. LOD0 NO se sube nunca; LOD1/LOD2 solo con una medida de fps del
  // 6v6 a 640x360 antes y después, apuntada en notes/players.md (plan del Vestuario, §3.2). lookSelfTest imprime el margen que queda.
  // TRI_TODAY (1.16, WP1): la puntera de la zapatilla por color de vértice ahorra 64/101/208 por pie (−128/−202/−416 en pista)
  var TRI_CAP = [4400, 6000, 12800];
  var TRI_TODAY = [
    { L: { style: 'rapado', acc: '' }, t: [2290, 3537, 8022], n: 'rapado sin complemento' },
    { L: { style: 'afro', acc: 'gafas' }, t: [3658, 5006, 10860], n: 'afro + gafas' },
    { L: { style: 'afro', acc: '', eyes: 'frente' }, t: [3658, 5006, 10860], n: 'afro + gafas en la frente (L nueva)' },
    { L: { style: 'tupe', acc: 'gorra' }, t: [2580, 3946, 8828], n: 'gorra' }
  ];
  // reglas de compatibilidad (las de VB.Look.CLASH; esta copia solo se usa si look.js no está cargado)
  var CLASH_FALLBACK = [
    { a: { slot: 'eyes', ids: ['frente'] }, b: { slot: 'head', ids: ['cinta', 'cintaRizo', 'bandana', 'gorra', 'visera', 'pescador', 'corona', 'gorraMTC'] } },
    { a: { slot: 'head', ids: ['bandana', 'pescador'] }, b: { slot: 'style', ids: ['afro'] } },
    { a: { slot: 'head', ids: ['corona'] }, b: { slot: 'style', ids: ['mono', 'dosmonos', 'cresta'] } },
    { a: { slot: 'head', ids: ['cintaRizo', 'bandana'] }, b: { slot: 'style', ids: ['dosmonos'] } },
    { a: { slot: 'head', ids: ['bandana'] }, b: { slot: 'style', ids: ['coletas'] } }
  ];
  /** Rig mínimo (esqueleto en reposo, sin material) para medir la geometría de un aspecto. */
  function testRig(L, bch, tc) {
    var root = new THREE.Group(), bones = [], bl = boneLayout();
    function bone(p, a, b, c) { var o = new THREE.Bone(); o.position.set(a || 0, b || 0, c || 0); p.add(o); bones.push(o); return o; }
    var body = bone(root), pelvis = bone(body, 0, HIP_H, 0), spine = bone(pelvis, 0, SPINE_Y, 0), chest = bone(spine, 0, CHEST_Y, 0), head = bone(chest, 0, NECK_Y, 0);
    ['eyes', 'mouth', 'teeth', 'browL', 'browR'].forEach(function (n) { bone(head, bl[n][0], bl[n][1], bl[n][2]); });
    var hair = bone(head, bl.hair[0], bl.hair[1], bl.hair[2]);
    var r = { bones: bones, pelvis: pelvis, chest: chest, head: head, hair: hair, sh: [], up: [], el: [], hand: [], th: [], kn: [], ft: [], look: L, tc: tc, beach: !!bch, geos: [null, null, null] };
    for (var k = 0; k < 2; k++) {
      var s = k ? -1 : 1, sh = bone(chest, s * SH_X, SH_Y, SH_Z), up = bone(sh), el = bone(up, 0, -UPPER, 0), hd = bone(el, 0, -FORE, 0);
      r.sh.push(sh); r.up.push(up); r.el.push(el); r.hand.push(hd);
      var hp = bone(pelvis, s * HIP_W, 0, 0), th = bone(hp), kn = bone(th, 0, -THIGH, 0), ft = bone(kn, 0, -SHIN, 0);
      r.th.push(th); r.kn.push(kn); r.ft.push(ft);
    }
    root.updateMatrixWorld(true); r.rest = bones.map(function (b) { return b.matrixWorld.clone(); });
    return r;
  }
  /** Triángulos [LOD0, LOD1, LOD2] y huella de la malla alta (posiciones, colores y UV) de un aspecto. */
  function measure(L, bch, tc, wantHash, onlyHi) {
    var r = testRig(L, bch, tc), t = [], h = 0, i;
    for (var l = onlyHi ? 2 : 0; l < 3; l++) {
      var g = rigGeometry(r, l); t.push(triCount(g));
      if (l === 2 && wantHash) ['position', 'color', 'uv', 'ow'].forEach(function (n) { var a = g.attributes[n].array; for (i = 0; i < a.length; i++) h = (Math.imul(h, 31) + Math.round(a[i] * 1e4)) | 0; });
      g.dispose(); r.geos[l] = null;
    }
    return { t: t, h: h };
  }
  function lookSelfTest() {
    if (!THREE) THREE = window.THREE;
    var t0 = Date.now(), fails = [], log = [], res = { ok: false, fails: fails, log: log, items: 0, today: [], worst: {}, budget: {}, styles: {}, tris: {}, draws: null, preview: null, ms: 0 };
    var tc = Object.assign({}, TEAMS[0]), hasCanvas = typeof document !== 'undefined' && !!document.createElement, cv = null, id;
    function fail(m) { fails.push(m); }
    function base(bch) { return { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: '' }; }
    function withSlot(L, slot, id) { var o = Object.assign({}, L); if (slot === 'style') o.style = id; else if (slot === 'head') o.acc = id; else o[slot] = id; return o; }
    if (hasCanvas) cv = canvas(ATLAS, ATLAS);
    // 0) el peto (partidillo) se pinta en las dos sedes y entra en la firma del atlas (no en la de la malla)
    var tcP = Object.assign({}, tc, { pattern: 'peto', bib: 0xff7a1a, numFill: '#1b1b1b' }), tcP2 = Object.assign({}, tcP, { bib: 0x9be52e }), LP = base(false);
    if (hasCanvas) [false, true].forEach(function (bch) { try { paintAtlas(cv, tcP, LP, 7, bch); } catch (e) { fail('atlas peto ' + (bch ? 'playa' : 'pista') + ': ' + (e && e.message || e)); } });
    if (atlasSig(LP, tcP, 7, false) === atlasSig(LP, tcP2, 7, false)) fail('atlasSig no ve el color del peto');
    if (geoSig(LP, tcP, false) !== geoSig(LP, tcP2, false)) fail('el color del peto cambia la malla (debería ir solo en el atlas)');
    // 1) el catálogo de look.js no trae nada que el muñeco no sepa dibujar (ni con otra sede)
    var CAT = VB.Look && VB.Look.CATALOG;
    if (CAT && CAT.length) CAT.forEach(function (it) {
      (it.slots || [it.slot]).forEach(function (sl) {
        if (sl === 'hairTint' || sl === 'color') return;
        // «as» (variantes como los objetos de jefe): sin dibujo propio, VB.Look.resolve pasa la pieza base (drawId de look.js)
        var did = ITEMS[sl] && !ITEMS[sl][it.id] && it.as ? it.as : it.id;
        if (!ITEMS[sl] || !ITEMS[sl][did]) fail('sin dibujo en doll.js: ' + sl + '=' + it.id + (did !== it.id ? ' (como ' + did + ')' : ''));
        else if (sl !== 'style' && did === it.id && (it.venue || 'A') !== ITEMS[sl][did]) fail('sede distinta en doll.js: ' + it.id + ' (' + it.venue + ' / ' + ITEMS[sl][did] + ')');
      });
    });
    // 2) cada objeto × sede × LOD se construye (y se pinta) sin errores; deltas sobre el muñeco base y geoSig fiel a la malla
    var delta = {}, itemD = {};   // itemD[id] = Δ [LOD0, LOD1, LOD2] sobre el muñeco base, el mayor de las dos sedes
    ['hall', 'beach'].forEach(function (v) {
      var bch = v === 'beach', B = base(bch), mb = measure(B, bch, tc, true), gb = geoSig(B, tc, bch);
      delta[v] = {}; res.styles[v] = {};
      ['style'].concat(LOOK_SLOTS).forEach(function (sl) {
        delta[v][sl] = [0, 0, 0];
        for (id in ITEMS[sl]) {
          var vn = ITEMS[sl][id]; if (vn !== 'A' && (vn === 'Y') !== bch) continue;
          var L = withSlot(B, sl, id), m = null; res.items++;
          try { m = measure(L, bch, tc, true); } catch (e) { fail('geometría ' + v + ' ' + sl + '=' + id + ': ' + (e && e.message || e)); continue; }
          if (hasCanvas) { try { paintAtlas(cv, tc, L, 7, bch); } catch (e) { fail('atlas ' + v + ' ' + sl + '=' + id + ': ' + (e && e.message || e)); } }
          for (var l = 0; l < 3; l++) delta[v][sl][l] = Math.max(delta[v][sl][l], m.t[l] - mb.t[l]);
          if (sl === 'style') res.styles[v][id] = m.t;
          var dk = itemD[id] || (itemD[id] = [0, 0, 0]); for (l = 0; l < 3; l++) dk[l] = Math.max(dk[l], m.t[l] - mb.t[l]);
          if (geoSig(L, tc, bch) === gb && m.h !== mb.h) fail('geoSig no ve el cambio de malla: ' + v + ' ' + sl + '=' + id);
          if (sl !== 'style' && sl !== 'head' && sl !== 'eyes') {   // un color que solo va en el atlas no cambia la malla
            ['cA', 'cB', 'cSock', 'cShoe', 'cGlass'].forEach(function (ck) {
              var L2 = Object.assign({}, L); L2[ck] = 0x8a4fd8;
              if (geoSig(L2, tc, bch) === geoSig(L, tc, bch)) { if (measure(L2, bch, tc, true, true).h !== m.h) fail('geoSig no ve ' + ck + ' con ' + sl + '=' + id + ' (' + v + ')'); }
            });
          }
        }
      });
    });
    // 2b) tris del catálogo de look.js al día (Δ medido sobre el muñeco base de su sede; los peinados, sobre el tupé). Margen: 40
    //     triángulos o el 15 % (los WP solo actualizan cifras cuando cambian una pieza de verdad); res.tris = lo medido, para copiarlo
    if (CAT && CAT.length) CAT.forEach(function (it) {
      var did = it.as && !(ITEMS[it.slot] && ITEMS[it.slot][it.id]) ? it.as : it.id, m = itemD[did];
      if (!m || !it.tris) return;
      var want = [Math.max(0, m[0]), Math.max(0, m[1]), Math.max(0, m[2])];
      res.tris[it.id] = want;
      for (var l = 0; l < 3; l++) if (Math.abs(want[l] - it.tris[l]) > Math.max(40, 0.15 * want[l])) { fail('tris desfasados en look.js: ' + it.id + ' [' + it.tris.join(', ') + '] (medido [' + want.join(', ') + '])'); break; }
    });
    // cada peinado ≤ el afro (el más pesado) en todos los LOD y en las dos sedes: así el peor caso de pelo es siempre el afro
    ['hall', 'beach'].forEach(function (v) {
      var S = res.styles[v], af = S && S.afro;
      if (!af) return;
      Object.keys(S).forEach(function (id) { for (var l = 0; l < 3; l++) if (S[id][l] > af[l]) { fail('el peinado ' + id + ' pesa más que el afro en ' + v + ' LOD' + l + ': ' + S[id][l] + ' > ' + af[l]); break; } });
    });
    // las firmas de malla de look.js (por fit) y de doll.js (por L) cambian a la vez: con cada objeto puesto sobre un muñeco mínimo
    // (tupé o rapado, nada más), cambiar cada hueco de color o el segundo color de pelo cambia las dos o ninguna. Si look.js dice
    // «misma malla» y doll.js la rehace, falta una letra en el vc del objeto; al revés, sobra
    if (VB.Look && VB.Look.geoSig && VB.Look.resolve && VB.Look.defaults && CAT) {
      var LK = VB.Look, KEYS = LK.COLOR_KEYS || [], CL_ = LK.COLOR_L || {}, nSig = 0, badSig = [];
      var minFit = function (ven, st) {
        var f = JSON.parse(JSON.stringify(LK.defaults(0))); f.style = st;
        (LK.SLOTS || []).forEach(function (s) { f.hall[s] = ''; f.beach[s] = ''; });
        f.hall.shoes = 'negras'; return f;   // (en pista siempre hay zapatillas: las negras no usan ningún color del fit)
      };
      ['hall', 'beach'].forEach(function (ven) {
        var bch = ven === 'beach';
        CAT.forEach(function (it) {
          if (it.slot === 'hairTint' || it.slot === 'color' || (it.venue !== 'A' && (it.venue === 'Y') !== bch)) return;
          var f = minFit(ven, it.slot === 'style' ? it.id : 'rapado');
          if (it.slot === 'shoes') f.hall.shoes = it.id;
          else if (it.slot !== 'style') it.slots.forEach(function (s) { f[ven][s] = it.id; });
          var vary = KEYS.map(function (k) { return ['colors', k]; }).concat([['hair2', null]]);
          vary.forEach(function (w) {
            var g = JSON.parse(JSON.stringify(f));
            if (w[0] === 'colors') g.colors[w[1]] = 'morado'; else g.hair2 = 'tRosa';
            var lookSame = LK.geoSig(f, ven) === LK.geoSig(g, ven);
            var dollSame = geoSig(LK.resolve(f, ven, tc), tc, bch) === geoSig(LK.resolve(g, ven, tc), tc, bch);
            nSig++;
            if (lookSame !== dollSame) badSig.push(ven + ' ' + it.id + ' ' + (w[1] || w[0]) + ' (look.js ' + (lookSame ? 'igual' : 'cambia') + ', doll.js ' + (dollSame ? 'igual' : 'cambia') + ')');
          });
        });
      });
      if (badSig.length) fail('geoSig de look.js y de doll.js no cuadran en ' + badSig.length + ' de ' + nSig + ' casos: ' + badSig.slice(0, 6).join(' | '));
    }
    // 3) los looks de hoy, con los triángulos EXACTOS de siempre
    TRI_TODAY.forEach(function (d) {
      var m = measure(Object.assign({ skin: 0xdba27a, hair: 0x3a2416 }, d.L), false, tc, false);
      res.today.push({ n: d.n, t: m.t });
      if (m.t.join('/') !== d.t.join('/')) fail('triángulos de ' + d.n + ': ' + m.t.join('/') + ' (deben ser ' + d.t.join('/') + ')');
    });
    if (VB.Look && VB.Look.defaults && VB.Look.resolve) {   // los fits por defecto se ven (y miden) como los MY_LOOKS de hoy
      [[0, 'hall', { style: 'tupe', acc: '' }], [0, 'beach', { style: 'tupe', acc: 'gorra' }], [1, 'hall', { style: 'afro', acc: 'cinta' }], [1, 'beach', { style: 'afro', acc: 'visera' }]].forEach(function (d) {
        try {
          var Ln = VB.Look.resolve(VB.Look.defaults(d[0]), d[1], tc), bch = d[1] === 'beach', Lo = Object.assign({ skin: Ln.skin, hair: Ln.hair }, d[2]);
          var a = measure(Ln, bch, tc, true), b = measure(Lo, bch, tc, true);
          if (a.h !== b.h) fail('defaults(' + d[0] + ') en ' + d[1] + ' no da la malla de hoy (' + a.t.join('/') + ' frente a ' + b.t.join('/') + ')');
        } catch (e) { fail('defaults(' + d[0] + ') ' + d[1] + ': ' + (e && e.message || e)); }
      });
    }
    // 4) peor combinación permitida por sede: peinado × gorro × gafas a mano (con las reglas de compatibilidad) + el peor de cada ranura
    var CL = VB.Look && VB.Look.CLASH && VB.Look.CLASH.length ? VB.Look.CLASH : CLASH_FALLBACK;
    function clashes(L) {
      for (var i = 0; i < CL.length; i++) {
        var a = CL[i].a, b = CL[i].b, va = a.slot === 'head' ? L.acc : L[a.slot], vb = b.slot === 'head' ? L.acc : L[b.slot];
        if (a.ids.indexOf(va) >= 0 && b.ids.indexOf(vb) >= 0) return true;
      }
      return false;
    }
    ['hall', 'beach'].forEach(function (v) {
      var bch = v === 'beach', best = { t: [0, 0, 0], L: ['', '', ''] }, extra = [0, 0, 0], eyesIds = [''], sid, eid, l;
      LOOK_SLOTS.forEach(function (sl) { if (sl !== 'head' && sl !== 'eyes') for (l = 0; l < 3; l++) extra[l] += delta[v][sl][l]; });
      for (eid in ITEMS.eyes) { var ve = ITEMS.eyes[eid]; if (ve === 'A' || (ve === 'Y') === bch) eyesIds.push(eid); }
      var heads = [''].concat(Object.keys(ITEMS.head).filter(function (h) { var vh = ITEMS.head[h]; return vh === 'A' || (vh === 'Y') === bch; }));
      for (sid in ITEMS.style) heads.forEach(function (h) {
        var top = null;
        eyesIds.forEach(function (e) {
          var L = { skin: 0xdba27a, hair: 0x3a2416, style: sid, acc: h, eyes: e };
          if (clashes(L)) return;
          var m = measure(L, bch, tc, false);
          if (!top || m.t[2] > top.t[2]) top = { t: m.t, L: L };
        });
        if (!top) return;
        var tot = [top.t[0] + extra[0], top.t[1] + extra[1], top.t[2] + extra[2]];
        for (l = 0; l < 3; l++) if (tot[l] > best.t[l]) { best.t[l] = tot[l]; best.L[l] = top.L.style + '+' + (top.L.acc || '-') + '+' + (top.L.eyes || '-'); }
      });
      res.worst[v] = best;
      res.budget[v] = [0, 1, 2].map(function (l) { return { lod: l, t: best.t[l], cap: TRI_CAP[l], margin: TRI_CAP[l] - best.t[l], look: best.L[l] }; });
      res.budget[v].forEach(function (b) {
        log.push('margen ' + (bch ? 'playa' : 'pista') + ' LOD' + b.lod + ': ' + b.t + ' / ' + b.cap + ' (quedan ' + b.margin + ', ' + (100 * b.margin / b.cap).toFixed(1) + ' %) · ' + b.look + ' + lo peor de cada ranura');
      });
      for (l = 0; l < 3; l++) if (best.t[l] > TRI_CAP[l]) fail('tope de triángulos en ' + v + ' LOD' + l + ': ' + best.t[l] + ' > ' + TRI_CAP[l] + ' (' + best.L[l] + ' + lo peor de cada ranura)');
    });
    // 5) 3 dibujos por muñeco (piel + tinta + sombra) con el look más cargado de playa
    if (hasCanvas) {
      try {
        var LF = { skin: 0x8a5638, hair: 0x241a14, style: 'coletas', acc: 'gorraAtras', eyes: 'frente', neck: 'conchas', wristL: 'reloj', wristR: 'muneq', hands: 'dedos', ankle: 'pulseraTob', armL: 'manguitoLlamas', band: 'capitan', paint: 'estrella', beard: 'bigote' };
        var rr = buildRig(LF, 91, { tc: tc, beach: true, px: 1, lod: 2 }), meshes = 0, shadows = 0;
        rr.root.traverse(function (o) { if (o.isMesh) { meshes++; if (o.castShadow) shadows++; } });
        res.draws = meshes + shadows; freeRig(rr);
        if (res.draws !== 3) fail('dibujos por muñeco: ' + res.draws + ' (deben ser 3: piel, tinta y sombra)');
      } catch (e) { fail('muñeco completo: ' + (e && e.message || e)); }
    }
    // 6) vista previa: un cambio solo de atlas no crea mallas; 20 cambios de malla seguidos no dejan nada en la GPU
    var C = VB.ctx, R = C && C.renderer;
    if (hasCanvas && R && C.scene && C.camera && R.info && R.info.memory) {
      var was = !!PV, keepL = was ? PV.L : null, keepO = was ? PV.o : null, P = preview, pr = { atlas: '', geoN: 0, mem0: null, mem1: null, memOff: null, memEnd: null };
      var mem = function () { R.render(C.scene, C.camera); return [R.info.memory.geometries, R.info.memory.textures]; };
      try {
        pr.memOff = was ? null : mem();
        if (!was) P.start(C, base(false), { beach: false });
        var L0 = PV.L, bch0 = PV.o.beach;
        pr.mem0 = mem();
        var cands = [['cSock', 0x3fbf5a], ['paint', 'rayas'], ['marks', 'pecas'], ['beard', 'bigote'], ['band', 'capitan']], La = null;
        for (var ci = 0; ci < cands.length && !La; ci++) {
          var Lc = Object.assign({}, L0); Lc[cands[ci][0]] = L0[cands[ci][0]] === cands[ci][1] ? (typeof cands[ci][1] === 'number' ? 0x3a6cf0 : '') : cands[ci][1];
          if (geoSig(Lc, PV.o.tc, bch0) === PV.gs && atlasSig(Lc, PV.o.tc, PV.o.num, bch0) !== PV.as) La = Lc;
        }
        if (La) {
          pr.atlas = P.set(La);
          var ma = mem();
          if (pr.atlas !== 'atlas') fail('preview.set con un cambio solo de atlas devolvió «' + pr.atlas + '»');
          if (ma[0] !== pr.mem0[0] || ma[1] !== pr.mem0[1]) fail('preview.set de atlas cambió la memoria de GPU: ' + pr.mem0.join('/') + ' → ' + ma.join('/'));
        } else fail('vista previa: no encontré un cambio solo de atlas');
        var STY = ['afro', 'cresta'];
        for (var gi = 0; gi < 20; gi++) {
          var Lg = Object.assign({}, L0, { style: STY[gi % 2] === L0.style ? 'coletas' : STY[gi % 2] });
          if (P.set(Lg) === 'geo') pr.geoN++;
          mem();
        }
        P.set(L0); pr.mem1 = mem();
        if (pr.geoN !== 20) fail('vista previa: ' + pr.geoN + ' de 20 cambios de peinado rehicieron la malla');
        if (pr.mem1[0] !== pr.mem0[0] || pr.mem1[1] !== pr.mem0[1]) fail('fuga en la vista previa: geometrías/texturas ' + pr.mem0.join('/') + ' → ' + pr.mem1.join('/'));
      } catch (e) { fail('vista previa: ' + (e && e.message || e)); }
      try {
        if (!was) { P.stop(); pr.memEnd = mem(); if (pr.memOff && (pr.memEnd[0] !== pr.memOff[0] || pr.memEnd[1] !== pr.memOff[1])) fail('la vista previa deja memoria al pararla: ' + pr.memOff.join('/') + ' → ' + pr.memEnd.join('/')); }
        else if (PV) P.set(keepL, keepO);
      } catch (e) { fail('vista previa (al acabar): ' + (e && e.message || e)); }
      res.preview = pr;
    }
    res.ok = !fails.length; res.ms = Date.now() - t0;
    try {
      console.info('[VB] lookSelfTest: ' + (res.ok ? 'bien' : fails.length + ' fallos') + ' (' + res.items + ' objetos, ' + res.ms + ' ms); peor pista ' + (res.worst.hall && res.worst.hall.t.join('/')) + ', playa ' + (res.worst.beach && res.worst.beach.t.join('/')));
      log.forEach(function (s) { console.info('[VB]   ' + s); });
    } catch (e) { }
    return res;
  }

  // =====================================================================
  //  RETRATO DEL MUÑECO (VB.Doll.portrait; spec S2-B2B3 §2.1 y §3.1, sprint 2)
  // =====================================================================
  // Busto de tres cuartos con el aspecto del Vestuario, pintado con el MISMO renderer en la esquina inferior izquierda del lienzo
  // (tijera) y copiado con drawImage a un canvas 2D. main.js lo llama en el paso 4b, ANTES del render del frame, que tapa el recuadro
  // (sin destello y sin leer píxeles de la GPU). Escena propia PT.scene: las luces copian TIPO, NÚMERO y castShadow de las visibles
  // de ctx.scene (así comparten programa con el juego), con posiciones fijas; niebla del mismo tipo, lejísimos. El muñeco no da ni
  // recibe sombra (si no, programa de profundidad nuevo y el mapa de sombras vacío ensucia la luz). Temporales de módulo: draw no
  // asigna nada salvo cuando cambia la firma de luces o el muñeco.
  var PT = null, PT_V2 = null, PT_V4 = null, PT_SC = null, PT_FOV = 28, PT_LS = [];
  var PT_ST = { n: 0, ms: 0, last: '', progs: 0 };
  // posiciones fijas de las luces direccionales (cámara en +X; a la izquierda de quien mira = +Z): principal arriba, izquierda y
  // por delante; relleno a la derecha y bajo; borde por detrás
  var PT_DIR = [[3, 4.2, 2.4], [2.2, 1.2, -3], [-3, 2.6, -1.6], [-2, 3, 2.5]];
  var PT_DEF = { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: '' };   // = MY_LOOKS[0] de players (por si falta players.js)
  function ptLightPush(o) { if (o.isLight && !o.isRectAreaLight && !o.isLightProbe) PT_LS.push(o); }
  /** Firma de las luces visibles de la escena del juego (tipo + sombra, en orden); deja la lista en PT_LS. */
  function ptLightSig(sc) {
    var s = '';
    PT_LS.length = 0;
    sc.traverseVisible(ptLightPush);
    for (var i = 0; i < PT_LS.length; i++) s += PT_LS[i].type.charAt(0) + (PT_LS[i].castShadow ? '*' : '') + ',';
    return s;
  }
  function ptDropLights() {
    for (var i = 0; i < PT.lights.length; i++) { var o = PT.lights[i]; PT.scene.remove(o); if (o.shadow && o.shadow.map) o.shadow.dispose(); }
    PT.lights.length = 0;
  }
  /** Rehace las luces de PT.scene con la firma de ctx.scene (src = PT_LS, recién llenada por ptLightSig). */
  function ptLights(src) {
    var i, o, n, d = 0;
    ptDropLights();
    for (i = 0; i < src.length; i++) {
      o = src[i]; n = null;
      if (o.isHemisphereLight) { n = new THREE.HemisphereLight(0xffffff, 0x000000, 1); n.position.copy(o.position); if (n.position.lengthSq() < 1e-6) n.position.set(0, 1, 0); n.position.normalize(); }
      else if (o.isDirectionalLight) { n = new THREE.DirectionalLight(0xffffff, 1); var p = PT_DIR[d++ % PT_DIR.length]; n.position.set(p[0], p[1], p[2]); }
      else if (o.isAmbientLight) n = new THREE.AmbientLight(0xffffff, 1);
      else if (o.isSpotLight) { n = new THREE.SpotLight(0xffffff, 0); n.position.set(0, 6, 0); }
      else if (o.isPointLight) { n = new THREE.PointLight(0xffffff, 0); n.position.set(0, 6, 0); }
      if (!n) continue;
      if (o.castShadow && n.shadow) { n.castShadow = true; n.shadow.mapSize.set(64, 64); }
      n.userData.ptSrc = o; PT.lights.push(n); PT.scene.add(n);
    }
  }
  /** Color e intensidad de cada luz copiada (la playa cambia de luz en vivo sin recompilar: aquí igual). Focos y puntos van a 0. */
  function ptLightTone() {
    for (var i = 0; i < PT.lights.length; i++) {
      var n = PT.lights[i], o = n.userData.ptSrc; if (!o) continue;
      n.color.copy(o.color);
      if (!n.isSpotLight && !n.isPointLight) n.intensity = o.intensity;
      if (n.groundColor && o.groundColor) n.groundColor.copy(o.groundColor);
    }
  }
  function ptFog(c) {
    var f = c.scene && c.scene.fog, want = !f ? '' : f.isFogExp2 ? 'e' : 'l';
    if (want === PT.fogT) return;
    PT.fogT = want;
    PT.scene.fog = !want ? null : want === 'e' ? new THREE.FogExp2(0x000000, 1e-7) : new THREE.Fog(0x000000, 900, 1000);
  }
  function ptKit(req) {
    if (req && req.tc && req.tc.base != null) return req.tc;
    try { if (VB.Players && VB.Players.kit) { var k = VB.Players.kit(0); if (k && k.base != null) return k; } } catch (e) { }
    return TEAMS[0];
  }
  /** Aspecto del retrato: req.L (VB.Look.resolve o una L vieja); si no, req.fit (un fit del Vestuario, se resuelve aquí con la sede y
   *  el kit); si no, VB.Players.baseLook (el de hoy sin Vestuario; T2) con guarda; si tampoco, el n.º 1 de siempre. Congelado. */
  function ptLook(req, tc) {
    var L = req && req.L, bch = !!(req && req.beach);
    if (!L && req && req.fit && VB.Look && VB.Look.resolve) { try { L = VB.Look.resolve(req.fit, bch ? 'beach' : 'hall', tc); } catch (e) { L = null; } }
    if (!L && VB.Players && typeof VB.Players.baseLook === 'function') {
      try { L = VB.Players.baseLook({ team: 0, idx: req && req.idx != null ? req.idx | 0 : 0, num: req && req.num, role: req && req.role, beach: bch }); } catch (e) { L = null; }
    }
    if (!L) L = bch ? PT_DEF_B : PT_DEF;
    return Object.isFrozen(L) ? L : Object.freeze(Object.assign({}, L));
  }
  var PT_DEF_B = { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: 'gorra' };
  function ptNum(req) { var n = req && req.num; return n != null && n !== '' ? n : 1; }
  function ptSize(req) { var s = +(req && req.size); return s > 8 ? Math.min(1024, Math.round(s)) : 256; }
  function ptBg(req) { var b = req && req.bg; return typeof b === 'number' && b >= 0 ? b & 0xffffff : 0x2a1f4a; }
  function ptYaw(req) { var y = req && req.yaw; return typeof y === 'number' && isFinite(y) ? y : 0.35; }
  function ptPose(req) { var p = req && req.pose; return p && POSES[p] ? p : 'stand'; }
  function ptFace(req) { var f = req && req.face; return f && EXPR[f] ? f : 'neutra'; }
  function ptInit(c) {
    if (!THREE) THREE = (c && c.THREE) || window.THREE;
    if (!THREE) return false;
    if (!PT_V2) { PT_V2 = new THREE.Vector2(); PT_V4 = new THREE.Vector4(); PT_SC = new THREE.Vector4(); }
    if (!PT) {
      PT = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(PT_FOV, 1, 0.1, 20), lights: [], sig: null, fogT: null, r: null, gs: '', as: '', bch: null, ty: 0, d: 0 };
      PT.scene.name = 'portrait'; PT.scene.background = new THREE.Color(0x2a1f4a);
    }
    ptFrame();
    return true;
  }
  /** Cámara del busto (medidas del muñeco activo): mira a la altura de los hombros + algo de cabeza, a la distancia en que caben la
   *  cabeza con gorro y los hombros. T21: el encuadre depende del tamaño (ptZoom): pequeño (cabecera de 44 px, 72 px) = la cabeza
   *  con el gorro entero, el cuello y un poco de hombros, más cerca y con aire arriba; grande (88 px y más) = el busto de siempre. */
  var PT_TY = 0.8, PT_D = 2.0, PT_UP = 0.05, PT_TY_H = 1.0, PT_D_H = 1.5, PT_UP_H = 0.02, PT_SIDE_H = 0.045;
  /** 0 = cara (lienzo ≤ 96 px: 44 px CSS a ×2), 1 = busto (≥ 176 px: 88 px CSS a ×2); req.zoom (0..1) lo fuerza. */
  function ptZoom(req) {
    var z = req && req.zoom;
    if (typeof z === 'number' && isFinite(z)) return clamp(z, 0, 1);
    return clamp((ptSize(req) - 96) / 80, 0, 1);
  }
  function ptFrame(z) {
    z = z == null ? 1 : z;
    var top = SH_H + HEAD_C + HEAD_RY, ty = SH_H + HEAD_C * lerp(PT_TY_H, PT_TY, z), d = lerp(PT_D_H, PT_D, z) * top / 1.64, up = lerp(PT_UP_H, PT_UP, z);
    var sz = -PT_SIDE_H * (1 - z) * top / 1.64;   // de cerca, el encuadre se corre a la derecha (−Z): cabe la visera, que sale por ese lado
    if (ty === PT.ty && d === PT.d) return;
    PT.cam.position.set(d, ty + up, sz); PT.cam.lookAt(0, ty, sz); PT.cam.updateMatrixWorld(true);
    PT.ty = ty; PT.d = d;
  }
  /** Miniaturas del Vestuario (req.frame = un encuadre de la vista previa, PV_FRAMES): la cámara del retrato encuadra esa caja del
   *  muñeco en el cuadrado (con un 8 % de aire), girada como la caja (salvo req.yaw). Devuelve la caja (o null). PT.ty/PT.d se borran
   *  para que el busto de siempre se recoloque luego. */
  function ptFrameBox(r, name) {
    var b = PV_FRAMES[name](pvMeasure(r)), tq = Math.tan(PT_FOV * PI / 360), hv = (b.hi - b.lo) * 0.5, ty = (b.hi + b.lo) * 0.5;
    var d = Math.max(0.4, Math.max(hv, b.lat) / (tq * 0.92)), up = b.up != null ? b.up : 0.1;
    PT.cam.position.set(d, ty + d * up, 0); PT.cam.lookAt(0, ty, 0); PT.cam.updateMatrixWorld(true);
    PT.ty = PT.d = NaN;
    return b;
  }
  /** Prepara la escena para req (luces, niebla, fondo, muñeco, pose y cara). Devuelve el rig. */
  function ptSetup(c, req) {
    var sig = c && c.scene ? ptLightSig(c.scene) : '';
    if (sig !== PT.sig) { PT.sig = sig; ptLights(PT_LS); }
    ptLightTone(); if (c && c.scene) ptFog(c);
    PT.scene.background.setHex(ptBg(req));
    var tc = ptKit(req), L = ptLook(req, tc), num = ptNum(req), bch = !!req.beach, gs = geoSig(L, tc, bch), as = atlasSig(L, tc, num, bch), r = PT.r;
    var lod = req.lod === 0 || req.lod === 1 ? req.lod : 2;   // (miniaturas del Vestuario: la malla media basta a 96 px y se monta antes)
    if (!r || gs !== PT.gs || bch !== PT.bch || lod !== PT.lod) {
      if (r) freeRig(r);
      r = PT.r = buildRig(L, 97, { tc: tc, num: num, beach: bch, px: 1, lod: lod }); PT.lod = lod;
      r.root.name = 'dollPortrait';
      r.skin.castShadow = false; r.skin.receiveShadow = false;
      if (r.ink) { r.ink.castShadow = false; r.ink.receiveShadow = false; }
      PT.scene.add(r.root); PT.gs = gs; PT.as = as; PT.bch = bch;
    } else if (as !== PT.as) {   // solo el atlas: se repinta el mismo lienzo (como preview.set)
      var m = r.skin.material, cv = m.map && m.map.image;
      r.look = L; r.tc = tc; r.num = num;
      m.userData.paint = { tc: tc, L: L, num: num, beach: bch };
      if (cv) { paintAtlas(cv, tc, L, num, bch); m.map.needsUpdate = true; }
      PT.as = as;
    }
    r.pose = ptPose(req); r.blinkOn = 0; r.tFix = 0;
    var fb = req.frame && PV_FRAMES[req.frame] ? ptFrameBox(r, req.frame) : null;
    if (!fb) ptFrame(ptZoom(req));
    animate(r, 0); setFace(r, ptFace(req));
    r.root.rotation.y = PI / 2 + (fb && typeof req.yaw !== 'number' ? fb.yaw : ptYaw(req));
    r.root.updateMatrixWorld(true);
    return r;
  }
  var portrait = {
    /** Clave de caché: 'geoSig|atlasSig|pose|face|yaw|bg|size' (cambia sola si cambian el look, la equipación o el dorsal); con
     *  req.zoom, además '|z' + el encuadre. */
    key: function (req) {
      req = req || {};
      if (!THREE) THREE = window.THREE;
      var tc = ptKit(req), L = ptLook(req, tc), bch = !!req.beach;
      return geoSig(L, tc, bch) + '|' + atlasSig(L, tc, ptNum(req), bch) + '|' + ptPose(req) + '|' + ptFace(req) + '|' + ptYaw(req).toFixed(3) + '|' + ptBg(req).toString(16) + '|' + ptSize(req) + (req.zoom != null ? '|z' + ptZoom(req).toFixed(2) : '') + (req.matte ? '|m' : '') + (req.frame ? '|f' + req.frame + (req.lod != null ? req.lod : '') : '');   // (req.frame: miniatura del Vestuario; req.matte: recorte con fondo transparente, main.js ptMatte)
    },
    /** Pinta el retrato en out2d (canvas 2D; se escala a su tamaño). c = VB.ctx. Devuelve los ms, o -1 si no puede (sin renderer, sin
     *  lienzo, error). Guarda y restaura viewport, tijera y render target; no toca autoClear. */
    draw: function (c, req, out2d) {
      c = c || VB.ctx; req = req || {};
      var R = c && c.renderer;
      if (!R || !out2d || !out2d.getContext || !ptInit(c)) return -1;
      var t0 = performance.now(), rt = R.getRenderTarget(), sct = R.getScissorTest(), T = VB.TOON, ok = false;
      R.getViewport(PT_V4); R.getScissor(PT_SC);
      try {
        R.getDrawingBufferSize(PT_V2);
        var S = Math.min(ptSize(req), PT_V2.x, PT_V2.y), pr = R.getPixelRatio(), w = S / pr;
        if (S >= 8) {
          ptSetup(c, req);
          if (T && T.frame) T.frame(PT.cam, S);   // grosor de la tinta para este lienzo (se devuelve abajo)
          if (rt) R.setRenderTarget(null);
          R.setScissorTest(true); R.setViewport(0, 0, w, w); R.setScissor(0, 0, w, w);
          R.render(PT.scene, PT.cam);
          out2d.getContext('2d').drawImage(R.domElement, 0, PT_V2.y - S, S, S, 0, 0, out2d.width, out2d.height);
          ok = true;
        }
      } catch (e) {
        try { console.error('[VB][ERROR] Doll.portrait.draw: ' + (e && e.message || e)); } catch (e2) { }
      } finally {
        R.setScissorTest(sct); R.setViewport(PT_V4); R.setScissor(PT_SC);
        if (rt) R.setRenderTarget(rt);
        if (T && T.frame && c.camera) T.frame(c.camera, c.height || 720);
      }
      if (!ok) return -1;
      var ms = performance.now() - t0;
      PT_ST.n++; PT_ST.ms = ms; PT_ST.last = portrait.key(req); PT_ST.progs = R.info && R.info.programs ? R.info.programs.length : 0;
      return ms;
    },
    /** Libera el muñeco, las luces (mapas de sombra) y la escena. main.js lo llama 1 s después de vaciar la cola. */
    free: function () {
      if (!PT) return false;
      if (PT.r) freeRig(PT.r);
      ptDropLights();
      PT = null; PT_LS.length = 0;
      return true;
    },
    /** Escena lista con un muñeco por defecto (o el de req) para que main.js la precompile (compileAsync). → {scene, camera} | null. */
    warm: function (c, req) {
      c = c || VB.ctx;
      if (!ptInit(c)) return null;
      try { ptSetup(c, req || {}); } catch (e) { try { console.error('[VB][ERROR] Doll.portrait.warm: ' + (e && e.message || e)); } catch (e2) { } return null; }
      return { scene: PT.scene, camera: PT.cam };
    },
    /** Para pruebas: {n retratos pintados, ms del último, clave del último, programas del renderer tras él}. */
    stats: function () { return { n: PT_ST.n, ms: PT_ST.ms, last: PT_ST.last, progs: PT_ST.progs }; },
    /** Para pruebas: estado interno (firma de luces, niebla, muñeco vivo, encuadre). */
    info: function () { return PT ? { sig: PT.sig, fog: PT.fogT, rig: !!PT.r, lights: PT.lights.length, ty: PT.ty, d: PT.d } : null; }
  };

  VB.Doll = {
    rigs: rigs, LOOKS: LOOKS, EXPR: EXPR, POSES: POSES,
    /** Vestuario: lo que el muñeco sabe dibujar por ranura (id → sede 'A' | 'P' | 'Y') y los gorros que sustituyen al pelo. */
    ITEMS: ITEMS, HIDE_HAIR: HIDE_HAIR,
    /** Vestuario: firmas de lo que cambia la malla (geometría y color por vértice) y de lo que se pinta en el atlas. */
    geoSig: function (L, tc, beach) { return geoSig(L, tc || TEAMS[0], !!beach); },
    atlasSig: function (L, tc, num, beach) { return atlasSig(L, tc || TEAMS[0], num, !!beach); },
    /** Vista previa del Vestuario (ver arriba): start, set, pose, face, spin, yaw, turn, place, frame, frameSlot, flash, update, stop, active, info. */
    preview: preview,
    /** Retrato del muñeco (spec S2-B2B3 §3.1): key, draw, free, warm, stats (e info para pruebas). */
    portrait: portrait,
    /** Prueba del Vestuario en el navegador (spec §9): devuelve {ok, fails, items, today, worst, draws, preview, ms}. */
    lookSelfTest: lookSelfTest,
    squash: squash, stretchArm: stretchArm, reachTo: reachTo, headBob: headBob, setFaceOf: setFace,
    /** Dimensiones del muñeco (m), las que usa players.js para montar el esqueleto: longitudes, cabeza (centro y radios en el hueso
     *  de la cabeza), estirón máximo del brazo (STRETCH), alcance estirado (reach) y de reposo (reachRest), hombro, alto de pie (top). */
    dims: function () { return { HIP_H: HIP_H, HIP_W: HIP_W, THIGH: THIGH, SHIN: SHIN, ANKLE: ANKLE, SPINE_Y: SPINE_Y, CHEST_Y: CHEST_Y, SH_X: SH_X, SH_Y: SH_Y, SH_Z: SH_Z, NECK_Y: NECK_Y, UPPER: UPPER, FORE: FORE, PALM: PALM, HEAD_C: HEAD_C, HEAD_RX: HEAD_RX, HEAD_RY: HEAD_RY, HEAD_RZ: HEAD_RZ, HAND_K: HAND_K, FOOT_K: FOOT_K, TORSO_W: TORSO_W, STRETCH: STRETCH_MAX, reach: REACH, reachRest: REACH_REST, shoulder: SH_H, top: SH_H + HEAD_C + HEAD_RY }; },
    reach: reachInfo,
    boneLayout: boneLayout,
    /** JUEGO (players.js): geometría del nivel `lod` (0 baja, 1 media, 2 alta) para un rig con el esqueleto del muñeco (ver rigGeometry). */
    geometry: function (r, lod) { return rigGeometry(r, lod); },
    /** JUEGO (players.js): material con el atlas del jugador. tc = equipación de players (setKit / líbero), L = aspecto (la L del
     *  Vestuario, §2.2, o la vieja {skin, hair, style, acc}), num = dorsal, beach = playa, px = 1 | 2 (lienzo 512² | 1024²). */
    material: function (tc, L, num, beach, px) { if (!THREE) THREE = window.THREE; return dollMaterial(tc, L, num, beach, px); },
    /** JUEGO (players.js): celdas de ojos (0-7) y boca (0-7) de un material del muñeco (ver la hoja de caras). */
    faceCells: faceCells,
    /** Construye un muñeco (fuera de la escena de depuración: pruebas). L = {skin, hair, style, acc, team, num, beach?}. */
    build: function (L, idx) { if (!THREE) { THREE = window.THREE; ctx = VB.ctx; applyDims(BODY); } return buildRig(L, idx || 0); },
    /** Preset de cuerpo activo ('chibi' | 'v1') y nombres. */
    body: function () { return BODY; },
    bodies: function () { return Object.keys(BODIES); },
    /** Cambia el preset de cuerpo en caliente (rehace los muñecos de la escena con su mismo aspecto). */
    setBody: function (name) {
      if (!BODIES[name]) return false;
      applyDims(name);
      if (on) { for (var i = 0; i < rigs.length; i++) this.restyle(i, null, null); placeView(view); applyCamera(); }
      return BODY;
    },
    /** Arranca la escena de depuración (main.js, ?debug=doll). */
    start: function (c, g) {
      ctx = c; THREE = c.THREE; if (VB.C && VB.C.BR) BR = VB.C.BR; TMP = new THREE.Vector3();
      applyDims((ctx.params && ctx.params.body) || 'chibi');
      var Qp = ctx.params || {};
      DBG_BEACH = Qp.map === 'beach' || Qp.map === 'playa'; DBG_TC = null;
      if (Qp.scrim && VB.Players && VB.Players.setKit) {
        var csh = /^[0-9a-f]{6}$/i.test(Qp.shirt || '') ? parseInt(Qp.shirt, 16) : 0xd8262e;
        VB.Players.setKit({ kitShirt: csh, kitAccent: 0xffffff, kitShorts: 0x1b2b5a, scrim: Qp.scrim === 'club' ? { bib0: csh, bib1: VB.Players.BIB.b } : {} });
        DBG_TC = [VB.Players.kit(0), VB.Players.kit(1)];
      }
      if (group) { ctx.scene.remove(group); }
      group = new THREE.Group(); group.name = 'dolls'; ctx.scene.add(group); rigs.length = 0;
      for (var i = 0; i < LOOKS.length; i++) { var r = buildRig(LOOKS[i], i); rigs.push(r); group.add(r.root); }
      rigs[0].ball = makeBall(); rigs[0].root.add(rigs[0].ball);
      rigs[2].ball = makeBall(); rigs[2].root.add(rigs[2].ball);   // el balón del remate (lo mueve el bucle del estirón)
      hideGame();
      if (g) g.watch = true;   // sin galón ni halo del controlado
      // HUD fuera: solo el pabellón y los muñecos
      if (!styleEl) { styleEl = document.createElement('style'); styleEl.textContent = '#hud,#coach,#prompt,#banner,#callout,#guide,#touch,#touchbar,#offArrow,#stamp,#rally,#chal,#fps{display:none!important}'; document.head.appendChild(styleEl); }
      placeView((ctx.params && ctx.params.view) || 'fila');
      on = true; tAnim = 0;
      try { if (ctx.fixShadowDepth) ctx.fixShadowDepth(); } catch (e) { }
      var ri = reachInfo(), st = this.stats();
      console.info('[VB] doll (' + BODY + '): alcance ' + ri.doll + ' m (atleta ' + ri.athlete + '), hombro ' + ri.shoulder + ', cabeza ' + ri.head + ' m hasta ' + ri.headTop + ' m (' + ri.heads + ' cabezas); triángulos alta/media/baja ' + st.tris.join('/') + ', dibujos ' + st.draws);
    },
    /** Cada frame (main.js, solo en ?debug=doll, después de la cámara): animación de la maqueta y cámara fija. */
    update: function (g, dt) {
      if (!on) return;
      dt = Math.min(0.05, dt || 0); tAnim += dt;
      // nivel de detalle según la calidad activa (la maqueta no está en la lista de módulos de main.js: se mira aquí)
      var rk = ctx.quality && ctx.quality.rank != null ? ctx.quality.rank : 2; if (rk !== lodNow) { lodNow = rk; this.setLod(rk); }
      for (var i = 0; i < rigs.length; i++) { var r = rigs[i]; if (!r.root.visible) continue; animate(r, r.tFix >= 0 ? r.tFix : tAnim + r.t0); blink(r, dt); }
      for (var h = 0; h < hidden.length; h++) hidden[h].visible = false;
      applyCamera();
    },
    /** Cambia la vista: 'fila' | 'poses' | 'cara' | 'cuerpo'. */
    view: function (name) { if (!on) return false; placeView(name); applyCamera(); return view; },
    /** Expresión de un muñeco (0-3): neutra | concentrado | esfuerzo | grito | alegria | pena | sorpresa | lengua. */
    setFace: function (i, name) { var r = rigs[i]; if (!r) return false; setFace(r, name); return r.face; },
    /** Pose de un muñeco: idle | recv | spike | cel | stand. */
    setPose: function (i, name) { var r = rigs[i]; if (!r || !POSES[name]) return false; r.pose = name; return true; },
    /** Capturas reproducibles: congela el bucle de cada muñeco en un instante (s) — {idx: t}; t < 0 = vuelve a correr.
     *  Remate: el golpe está en t = 0,8 (ciclo de 1,9 s); celebración: en el aire en t = 0,38 (ciclo de 1,1 s). */
    freeze: function (map) { for (var k in map) if (rigs[k]) { rigs[k].tFix = map[k]; rigs[k].blinkOn = 0; } return true; },
    /** Rehace un muñeco con otro peinado / complemento (pruebas). Para probar otras ranuras del Vestuario: rigs[i].look = L nueva y
     *  restyle(i) (o VB.Doll.preview, que es la vista previa de verdad). */
    restyle: function (i, style, acc) {
      var r = rigs[i]; if (!r) return false;
      var L = Object.assign({}, r.look); if (style) L.style = style; if (acc != null) L.acc = acc;
      if (r.ball && r.ball.parent === r.root) r.root.remove(r.ball);
      var n = buildRig(L, i); n.pose = r.pose; n.ball = r.ball; n.tFix = r.tFix; if (r.ball) n.root.add(r.ball);
      n.root.position.copy(r.root.position); n.root.rotation.copy(r.root.rotation); setFace(n, r.face);
      freeRig(r);   // fuera de la escena y de la GPU (atlas, material, mallas, huesos y contorno)
      group.add(n.root); rigs[i] = n; return true;
    },
    /** Nivel de detalle de todos (0 baja, 1 media, 2 alta). */
    setLod: function (lod) { for (var i = 0; i < rigs.length; i++) setLod(rigs[i], lod); return lod; },
    setQuality: function (q) { var rk = q && q.rank != null ? q.rank : 2; if (on) this.setLod(rk); },
    /** Triángulos por nivel (muñeco 0) y dibujos por muñeco (piel + tinta + sombra). */
    stats: function () {
      var r = rigs[0]; if (!r) return null;
      var tris = [0, 1, 2].map(function (l) { return triCount(rigGeometry(r, l)); });
      return { tris: tris, draws: 1 + (r.ink ? 1 : 0) + 1, reach: reachInfo() };
    },
    active: function () { return on; }
  };
})();
