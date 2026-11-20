/* MAKE THE CUT — js/career-natl.js (owner: seleccion)
 * Selección nacional de la Carrera (VB.CareerNatl), para la pista (6v6) y la playa (parejas nacionales, 2v2).
 *  - Cada verano (entre el final de la liga y la temporada siguiente) hay un torneo de selecciones, en un ciclo de 4 años: VBN, el
 *    continental de tu región («Europeo VEC»…), el Mundial VBF y los Juegos Cuatrienales (nombres inventados de js/leagues.js). En la
 *    playa: Circuito de Naciones de Playa, «… de Playa» y los Juegos. El ciclo arranca en un punto distinto según la semilla.
 *  - El seleccionador (inventado, uno por ciclo) te convoca según tu media, la nota de la temporada, tu fama, la liga y su confianza:
 *    «Sin convocar», «Prelista», «Convocado», «Titular» (playa: «Pareja 2», «Pareja 1»; la Pareja 2 no va al Mundial ni a los Juegos)
 *    o «Lesionado» (una baja de otra extensión, VB.Career.ext.blocked).
 *  - Torneo: grupos de 4, cuartos, semifinal, final y bronce (como mucho 6 partidos tuyos). Cada partido tuyo se juega con el motor
 *    de la Carrera (VB.CareerExt setup/done → main.js startCareerExt) o se simula. Compañeros inventados, camiseta lisa con los
 *    colores de la bandera (sin escudo), pabellón del anfitrión y presión (debut, primera final). Si firmas antes de acabar, el resto
 *    se simula (gancho 'newSeason').
 *  - Pista: si tu país está en la repesca del torneo de ese verano, a mitad de liga hay 2 partidos de clasificación ('q'); si no los
 *    juegas antes de la siguiente jornada del club, se simulan.
 *  - Medallas ('sel' oro, 'selm' plata/bronce, 'selp' premios del torneo) al Palmarés y a la Vitrina (grupo «Selección»), fama,
 *    legado y partidos con la selección en el Salón de la Fama (career-life lee c.natl.car.caps).
 *  - Interfaz (VB.CareerUIExt, prefijo 'nt-'): Club › Selección, tarjeta en Partido (hueco 'match'), línea en Palmarés, punto de
 *    aviso. Con «Carrera con vida» (VB.CareerStory): plantilla de prensa 'nt-press', publicaciones en Redes y aviso en Partido.
 * Sin DOM al cargar (se carga en node con vm: tools/natltest.js). Estado en c.natl (ensure idempotente y sin tiradas; sin subir
 * VER/VER6). Azar solo por hash de la semilla: R(c, …) = K._rng(K._hash(c.seed, 'natl', …)). Nunca Math.random ni Date.now.
 * Diseño completo: notas del lote en CONTRACT.md «Extensiones de la Carrera».
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ motor de la carrera c (como career-life.js K(c))
  var HV = null, HVsrc = null;
  function hall(c) { return !!(c && c.mode === 'hall'); }
  function K(c) {
    var C = VB.Career; if (!c || !C || !C.beach) return C;
    if (!hall(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function B() { return VB.Career && VB.Career.beach; }
  function L() { return VB.CareerLife || null; }
  function hsh() { var b = B(), a = Array.prototype.slice.call(arguments); return b._hash.apply(null, a); }
  /** Generador determinista de la carrera c con las claves dadas (siempre con la etiqueta 'natl'). */
  function R(c) { var a = Array.prototype.slice.call(arguments, 1), b = B(); return b._rng(b._hash.apply(null, [c.seed, 'natl'].concat(a))); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampN(v, a, b, d) { v = +v; return isFinite(v) ? clamp(v, a, b) : d; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function dec(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  function num(v) { var Lf = L(); return Lf && Lf.num ? Lf.num(v) : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function obj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function ordM(n) { return n + (n === 1 || n === 3 ? 'r' : 'º'); }   // «1r», «2º», «3r»
  function ordF(n) { return n + 'ª'; }   // femenino (la selección: «termina 4ª»)

  // ------------------------------------------------------------------ selecciones (46): [código, nombre, siglas, región, fuerza, camiseta, detalle, pantalón, líbero]
  // Camisetas lisas con los colores de la bandera; sin escudos ni federaciones. La fuerza de los 28 países con liga se lee de la 1ª
  // división de js/leagues.js (estos números son la reserva sin ese fichero); los 18 restantes solo existen como selección.
  var NAT = [
    ['IT', 'Italia', 'ITA', 'Europa', 90, 0x1f9a4a, 0xffffff, 0xd8262e, 0xf2f4f8], ['PL', 'Polonia', 'POL', 'Europa', 88, 0xf2f4f8, 0xd8262e, 0xd8262e, 0xd8262e],
    ['TR', 'Turquía', 'TUR', 'Europa', 87, 0xd8262e, 0xffffff, 0xf2f4f8, 0xf2f4f8], ['RU', 'Rusia', 'RUS', 'Europa', 82, 0xf2f4f8, 0x1f4e9e, 0xd8262e, 0x1f4e9e],
    ['FR', 'Francia', 'FRA', 'Europa', 82, 0x1f3c8f, 0xffffff, 0xf2f4f8, 0xd8262e], ['DE', 'Alemania', 'GER', 'Europa', 80, 0x1a1c22, 0xd8262e, 0x1a1c22, 0xf2c230],
    ['ES', 'España', 'ESP', 'Europa', 72, 0xd8262e, 0xf2c230, 0x1b2a6b, 0xf2c230], ['BE', 'Bélgica', 'BEL', 'Europa', 64, 0xd8262e, 0xf2c230, 0x1a1c22, 0xf2c230],
    ['NL', 'Países Bajos', 'NED', 'Europa', 59, 0xff7a1a, 0xffffff, 0x1f3c8f, 0x1f3c8f], ['GR', 'Grecia', 'GRE', 'Europa', 65, 0x1f5fbf, 0xffffff, 0xf2f4f8, 0xf2f4f8],
    ['PT', 'Portugal', 'POR', 'Europa', 60, 0xb3161d, 0x1f9a4a, 0x1f9a4a, 0xf2c230], ['CH', 'Suiza', 'SUI', 'Europa', 57, 0xd8262e, 0xffffff, 0xf2f4f8, 0xf2f4f8],
    ['AT', 'Austria', 'AUT', 'Europa', 54, 0xd8262e, 0xffffff, 0xf2f4f8, 0x1a1c22], ['CZ', 'Chequia', 'CZE', 'Europa', 59, 0xf2f4f8, 0x1f4e9e, 0xd8262e, 0x1f4e9e],
    ['RS', 'Serbia', 'SRB', 'Europa', 62, 0xd8262e, 0x1f4e9e, 0x1f4e9e, 0xf2f4f8], ['SI', 'Eslovenia', 'SLO', 'Europa', 58, 0x1f4e9e, 0xffffff, 0xd8262e, 0xf2f4f8],
    ['RO', 'Rumanía', 'ROU', 'Europa', 60, 0xf2c230, 0x1f4e9e, 0x1f4e9e, 0xd8262e], ['BR', 'Brasil', 'BRA', 'América', 88, 0xf2c230, 0x1f9a4a, 0x1f4e9e, 0x1f4e9e],
    ['AR', 'Argentina', 'ARG', 'América', 65, 0x8fd3ff, 0xffffff, 0x1b2a6b, 0x1b2a6b], ['US', 'Estados Unidos', 'USA', 'América', 68, 0x1b2a6b, 0xd8262e, 0xf2f4f8, 0xd8262e],
    ['CA', 'Canadá', 'CAN', 'América', 56, 0xd8262e, 0xffffff, 0x1a1c22, 0xf2f4f8], ['PE', 'Perú', 'PER', 'América', 60, 0xf2f4f8, 0xd8262e, 0xd8262e, 0xd8262e],
    ['JP', 'Japón', 'JPN', 'Asia', 80, 0xf2f4f8, 0xd8262e, 0xd8262e, 0x1b2a6b], ['KR', 'Corea del Sur', 'KOR', 'Asia', 67, 0xd8262e, 0x1f4e9e, 0xf2f4f8, 0xf2f4f8],
    ['CN', 'China', 'CHN', 'Asia', 68, 0xd8262e, 0xf2c230, 0xd8262e, 0xf2c230], ['IR', 'Irán', 'IRN', 'Asia', 67, 0xf2f4f8, 0x1f9a4a, 0xd8262e, 0x1f9a4a],
    ['QA', 'Catar', 'QAT', 'Asia', 65, 0x7a1335, 0xffffff, 0xf2f4f8, 0xf2f4f8], ['PH', 'Filipinas', 'PHI', 'Asia', 54, 0x1f4e9e, 0xf2c230, 0xd8262e, 0xd8262e],
    ['HR', 'Croacia', 'CRO', 'Europa', 58, 0xf2f4f8, 0xd8262e, 0x1f4e9e, 0x1f4e9e], ['UA', 'Ucrania', 'UKR', 'Europa', 63, 0xf2c230, 0x1f5fbf, 0x1f5fbf, 0x1f5fbf],
    ['BG', 'Bulgaria', 'BUL', 'Europa', 64, 0xf2f4f8, 0x1f9a4a, 0xd8262e, 0x1f9a4a], ['FI', 'Finlandia', 'FIN', 'Europa', 52, 0xf2f4f8, 0x1f4e9e, 0x1f4e9e, 0x1f4e9e],
    ['CU', 'Cuba', 'CUB', 'América', 70, 0x1f4e9e, 0xd8262e, 0xf2f4f8, 0xd8262e], ['MX', 'México', 'MEX', 'América', 58, 0x1f9a4a, 0xffffff, 0xf2f4f8, 0xd8262e],
    ['PR', 'Puerto Rico', 'PUR', 'América', 56, 0xd8262e, 0xffffff, 0x1f5fbf, 0x1f5fbf], ['CL', 'Chile', 'CHI', 'América', 55, 0xd8262e, 0xffffff, 0x1f4e9e, 0xf2f4f8],
    ['CO', 'Colombia', 'COL', 'América', 57, 0xf2c230, 0x1f4e9e, 0x1f4e9e, 0xd8262e], ['DO', 'República Dominicana', 'DOM', 'América', 62, 0x1b2a6b, 0xd8262e, 0xf2f4f8, 0xd8262e],
    ['TH', 'Tailandia', 'THA', 'Asia', 62, 0x1b2a6b, 0xd8262e, 0xf2f4f8, 0xd8262e], ['KZ', 'Kazajistán', 'KAZ', 'Asia', 50, 0x32b5e8, 0xf2c230, 0x32b5e8, 0xf2c230],
    ['AU', 'Australia', 'AUS', 'Asia', 55, 0xf2c230, 0x1f9a4a, 0x1f9a4a, 0x1f9a4a], ['IN', 'India', 'IND', 'Asia', 52, 0xff7a1a, 0x1f9a4a, 0xf2f4f8, 0x1f5fbf],
    ['EG', 'Egipto', 'EGY', 'África', 60, 0xd8262e, 0xf2f4f8, 0x1a1c22, 0xf2f4f8], ['TN', 'Túnez', 'TUN', 'África', 57, 0xd8262e, 0xffffff, 0xf2f4f8, 0xf2f4f8],
    ['CM', 'Camerún', 'CMR', 'África', 54, 0x1f9a4a, 0xd8262e, 0xf2c230, 0xf2c230], ['KE', 'Kenia', 'KEN', 'África', 50, 0x1a1c22, 0xd8262e, 0x1f9a4a, 0xd8262e]
  ];
  var REGIONS = ['Europa', 'América', 'Asia', 'África'];
  var NBY = null, NSRC = null;
  /** Ficha de cada selección {cc, name, ab, region, str, kit, city, club} (con la fuerza y la ciudad de js/leagues.js si está). */
  function nats() {
    var Lg = VB.Leagues || null;
    if (NBY && NSRC === Lg) return NBY;
    NSRC = Lg; NBY = {};
    var top = {};
    try {
      (Lg && Array.isArray(Lg.regions) ? Lg.regions : []).forEach(function (rg) {
        (rg && Array.isArray(rg.countries) ? rg.countries : []).forEach(function (co) {
          var d = (co.divisions || []).filter(function (x) { return x && x.lvl === 1 && Array.isArray(x.clubs) && x.clubs.length; })[0];
          if (!d || !co.code) return;
          var k = d.clubs.slice().sort(function (a, b) { return (b.ovr | 0) - (a.ovr | 0); })[0];
          top[co.code] = { str: +d.strength || 0, name: String(co.country || ''), club: k ? { name: k.name, short: k.short, city: k.city, colors: k.colors, ovr: k.ovr, cc: co.code, lvl: 1, strength: d.strength } : null };
        });
      });
    } catch (e) { top = {}; }
    NAT.forEach(function (x) {
      var t = top[x[0]], city = t && t.club && t.club.city ? String(t.club.city).replace(/\s*\(.*\)\s*$/, '') : '';
      NBY[x[0]] = { cc: x[0], name: t && t.name ? t.name : x[1], ab: x[2], region: x[3], str: t && t.str >= 30 ? Math.round(t.str) : x[4],
        kit: { shirt: x[5], accent: x[6], shorts: x[7], libero: x[8], pattern: 'liso' }, city: city, club: t ? t.club : null };
    });
    return NBY;
  }
  function natOf(cc) { return nats()[cc] || null; }
  var CODES = NAT.map(function (x) { return x[0]; });
  function kitOpt(cc) { var k = natOf(cc).kit; return { kitShirt: k.shirt, kitAccent: k.accent, kitShorts: k.shorts, kitPattern: 'liso', kitLibero: k.libero }; }

  // ------------------------------------------------------------------ torneos
  // art: artículo del nombre (el/la/los). T: equipos. rep: repesca de 3 por la última plaza.
  var CYC = ['vbn', 'cont', 'wc', 'games'];
  var EV = {
    vbn: { key: 'vbn', short: 'VBN', name: 'VBN', art: 'la', beach: 'Circuito de Naciones de Playa', bArt: 'el', T: 16, rep: false, fame: 1500, leg: 12, fev: 8 },
    cont: { key: 'cont', short: 'EUV', name: 'Europeo VEC', art: 'el', beach: 'Europeo VEC de Playa', bArt: 'el', T: 16, rep: true, fame: 2500, leg: 18, fev: 10 },
    wc: { key: 'wc', short: 'MUV', name: 'Mundial VBF', art: 'el', beach: 'Mundial VBF de Playa', bArt: 'el', T: 16, rep: true, fame: 5000, leg: 30, fev: 15 },
    games: { key: 'games', short: 'JCU', name: 'Juegos Cuatrienales', art: 'los', beach: 'Juegos Cuatrienales', bArt: 'los', T: 8, rep: true, fame: 8000, leg: 40, fev: 20 }
  };
  var CONT = { 'Europa': 'Europeo VEC', 'América': 'Continental Americano', 'Asia': 'Continental Asiático', 'África': 'Continental Africano' };
  var FAME_EV = { q: 4, vbn: 8, cont: 10, wc: 15, games: 20 };
  var CUT = { tit: 2, conv: -5, pre: -9 };
  var NATL_XP = { hall: 2.5, beach: 3.0 };
  var ST = ['out', 'pre', 'conv', 'tit', 'p2', 'p1', 'inj'];
  var ROUNDS = ['g1', 'g2', 'g3', 'qf', 'sf', 'f', 'b', 'q1', 'q2'];
  var STAGES = ['g1', 'g2', 'g3', 'qf', 'sf', 'f', 'q1', 'q2', 'done'];
  var RK_PTS = { 1: 40, 2: 30, 3: 24, 4: 20 };
  var HIST_MAX = 40;
  var OFF = false;   // (solo pruebas: true lo apaga del todo; tools/natltest.js §1)

  /** Nombre del continental de una región (de js/leagues.js si trae el de Europa). */
  function contName(region) {
    var n = CONT[region] || 'Continental';
    if (region === 'Europa') n = compName('EUV') || n;
    return n;
  }
  function compName(short) {
    var Lg = VB.Leagues, out = '';
    try { (Lg && Lg.regions || []).some(function (rg) { return (rg.competitions || []).some(function (x) { if (x && x.short === short && x.kind === 'skip') { out = String(x.name); return true; } return false; }); }); } catch (e) { out = ''; }
    return out;
  }
  /** {name, art} del torneo ev para la carrera c (región de su país; playa: los nombres de playa). */
  function evInfo(c, ev, cc) {
    var E = EV[ev] || EV.vbn, hl = hall(c), nat = natOf(cc || (c && c.natl && c.natl.cc) || 'ES') || natOf('ES');
    if (ev === 'cont') {
      var cn = contName(nat.region);
      return { name: hl ? cn : cn + ' de Playa', art: 'el' };
    }
    if (!hl) return { name: E.beach, art: E.bArt };
    return { name: compName(E.short) || E.name, art: E.art };
  }
  function evName(c, ev, cc) { return evInfo(c, ev, cc).name; }
  function theEv(i) { return i.art + ' ' + i.name; }
  function deEv(i) { return (i.art === 'el' ? 'del ' : 'de ' + i.art + ' ') + i.name; }
  function aEv(i) { return (i.art === 'el' ? 'al ' : 'a ' + i.art + ' ') + i.name; }
  function enEv(i) { return 'en ' + i.art + ' ' + i.name; }
  function low1(s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /** Desfase del ciclo (cada carrera arranca en un punto distinto) y torneo / ciclo del verano tras la temporada s. */
  function cycOff(c) { return hsh(c.seed, 'natl-cyc') % 4; }
  function evOf(c, s) { return CYC[((s | 0) + cycOff(c)) % 4]; }
  function cycOf(c, s) { return Math.floor(((s | 0) + cycOff(c)) / 4); }
  /** Fuerza de una selección en un ciclo (deriva por hash, sin tirar) y su equivalente de playa. */
  function str(c, cc, cyc) { var n = natOf(cc); return n ? n.str + (hsh(c.seed, 'natl-drift', cc, cyc) % 5) - 2 : 50; }
  function strB(c, cc, cyc) { return Math.round(46 + (str(c, cc, cyc) - 50) * 0.65); }
  function Sof(c, cc, cyc) { return hall(c) ? str(c, cc, cyc) : strB(c, cc, cyc); }
  function rkScore(c, cc, cyc) { var rk = c.natl && c.natl.rk || {}; return str(c, cc, cyc) + (+rk[cc] || 0) / 10; }
  function ranked(c, list, cyc) { return list.slice().sort(function (a, b) { return rkScore(c, b, cyc) - rkScore(c, a, cyc) || (a < b ? -1 : 1); }); }

  // ------------------------------------------------------------------ estado (c.natl)
  function newState(c) {
    return { v: 1, cc: hall(c) && natOf(c.cc) ? c.cc : 'ES', lock: hall(c) ? 1 : 0, st: 'out', stS: 0, trust: 50, chem: 20, rk: {}, win: null, hist: [], q: {},
      car: { caps: 0, starts: 0, w: 0, l: 0, kills: 0, aces: 0, blocks: 0, digs: 0, nS: 0, nN: 0, debut: 0 }, med: { g: 0, s: 0, b: 0 },
      seen: 0, youth: 0, n: 0, cyc: -1, lastN: 0, fin: 0 };
  }
  function nn(v, d) { v = +v; return isFinite(v) && v >= 0 ? v : d; }
  /** Crea o repara c.natl (idempotente, sin tiradas). Lo que no cuadra vuelve a su valor por defecto sin perder lo demás. */
  function ensure(c) {
    if (!c || typeof c !== 'object') return null;
    var n = c.natl;
    if (!obj(n)) n = c.natl = newState(c);
    n.v = 1;
    if (hall(c)) { if (natOf(c.cc)) n.cc = c.cc; else if (!natOf(n.cc)) n.cc = 'ES'; n.lock = 1; }
    else { if (!natOf(n.cc)) n.cc = 'ES'; n.lock = n.lock ? 1 : 0; }
    if (ST.indexOf(n.st) < 0) n.st = 'out';
    n.stS = nn(n.stS, 0) | 0; n.trust = clampN(n.trust, 0, 100, 50); n.chem = clampN(n.chem, 0, 100, 20);
    // sub-19: el prólogo juvenil jugado (informe de los ojeadores o cerrado; no 'skip') suma +1 en la nota del seleccionador
    var pro = obj(c.pro) ? c.pro : null;
    n.seen = nn(n.seen, 0) | 0; n.youth = n.youth || (pro && (pro.st === 'done' || pro.st === 'scout') && (pro.i | 0) >= 1) ? 1 : 0; n.n = nn(n.n, 0) | 0; n.cyc = isFinite(+n.cyc) ? n.cyc | 0 : -1;
    n.lastN = clampN(n.lastN, 0, 10, 0); n.fin = nn(n.fin, 0) | 0; n.qS = nn(n.qS, 0) | 0;
    if (!obj(n.rk)) n.rk = {};
    Object.keys(n.rk).forEach(function (k) { if (!natOf(k) || !isFinite(+n.rk[k])) delete n.rk[k]; else n.rk[k] = clamp(+n.rk[k], 0, 200); });
    if (!obj(n.q)) n.q = {};
    Object.keys(n.q).forEach(function (k) { var x = n.q[k]; if (!obj(x) || !EV[x.ev] || !natOf(x.w)) delete n.q[k]; });
    if (!Array.isArray(n.hist)) n.hist = [];
    n.hist = n.hist.filter(function (h) { return obj(h) && isFinite(+h.s); });
    if (n.hist.length > HIST_MAX) n.hist = n.hist.slice(-HIST_MAX);
    if (!obj(n.car)) n.car = {};
    ['caps', 'starts', 'w', 'l', 'kills', 'aces', 'blocks', 'digs', 'nS', 'nN', 'debut'].forEach(function (k) { n.car[k] = nn(n.car[k], 0); });
    if (!obj(n.med)) n.med = {};
    ['g', 's', 'b'].forEach(function (k) { n.med[k] = nn(n.med[k], 0) | 0; });
    if (n.win != null && !winOk(n.win)) n.win = null;
    return n;
  }
  function winOk(w) {
    if (!obj(w) || (w.kind !== 'sum' && w.kind !== 'q') || !EV[w.ev] || !isFinite(+w.id) || !isFinite(+w.s)) return false;
    if (!Array.isArray(w.teams) || w.teams.length < 2 || !w.teams.every(natOf) || !natOf(w.my)) return false;
    if (!Array.isArray(w.fx) || STAGES.indexOf(w.stage) < 0) return false;
    if (w.kind === 'sum' && (!Array.isArray(w.groups) || !w.groups.every(function (g) { return Array.isArray(g) && g.every(function (x) { return w.teams.indexOf(x) >= 0; }); }))) return false;
    for (var i = 0; i < w.fx.length; i++) {
      var f = w.fx[i];
      if (!obj(f) || f.i !== i || ROUNDS.indexOf(f.r) < 0 || w.teams.indexOf(f.a) < 0 || w.teams.indexOf(f.b) < 0) return false;
      if (f.res != null && (!obj(f.res) || !Array.isArray(f.res.s) || f.res.s.length !== 2 || !Array.isArray(f.res.sc))) return false;
    }
    if (ST.indexOf(w.st) < 0) w.st = 'out';
    w.on = w.on ? 1 : 0; w.dec = w.dec ? 1 : 0; w.out = w.out ? 1 : 0;
    if (!obj(w.mt)) w.mt = { n: 0, sum: 0 };
    return true;
  }

  // ------------------------------------------------------------------ convocatoria
  function fameIdx(c) { var Lf = L(); try { return Lf && Lf.fameInfo ? Lf.fameInfo(c).i | 0 : 0; } catch (e) { return 0; } }
  function ligaLvl(c) { var Lf = L(); try { return Lf && Lf.lvlOf ? Lf.lvlOf(c) | 0 : 0; } catch (e) { return 0; } }
  /** Nota del seleccionador: media, nota de la temporada, fama, liga, confianza, juventud y paso por la sub-19 (prólogo). */
  function scoreOf(c) {
    var E = K(c), n = ensure(c), ovr = E.playerOvr(c), nt = E.avgNota(c);
    if (nt == null) nt = 6.5;
    var age = c.player && c.player.age | 0;
    return round1(ovr + 3 * (nt - 6.5) + 0.6 * fameIdx(c) + 0.8 * ligaLvl(c) + 0.06 * (n.trust - 50) + (age && age <= 21 ? 1 : 0) + (n.youth ? 1 : 0));
  }
  /** Baja de otra extensión (lesiones…): estado «Lesionado». */
  function injured(c) {
    try {
      var X = VB.Career && VB.Career.ext; if (X && X.blocked) { var b = X.blocked(c, null); if (b && b.id) return true; }
      // En verano (fase 'off') blocked y out callan («en verano se cura»), pero el torneo empieza justo al acabar la liga: una baja
      // que aún dura 3 partidos o más, o una de las serias, te deja fuera de la convocatoria (se mira con la fase de liga, sin tocar c).
      var I = VB.CareerInjury;
      if (c && c.phase === 'off' && I && typeof I.out === 'function') { var o = I.out({ inj: c.inj, phase: 'league' }); return !!(o && ((o.left | 0) >= 3 || (o.sev | 0) >= 2)); }
      return false;
    } catch (e) { return false; }
  }
  /** Tras un partido tuyo de la clasificación (mitad de liga): la misma tirada de lesión que un partido de club (career-injury.js). */
  function injRoll(c, w) {
    var I = VB.CareerInjury; if (!I || typeof I.roll !== 'function' || w.kind !== 'q' || c.phase === 'off') return null;
    var inj = null; try { inj = I.roll(c, 1, 'sel', { label: w.name ? 'Selección: ' + w.name : 'Selección', season: c.season | 0 }); } catch (e) { inj = null; }
    if (inj && w.stage !== 'done') { w.st = 'inj'; w.on = 0; ensure(c).st = 'inj'; msg(c, 'Baja con ' + natOf(w.my).name, 'La lesión te deja fuera del resto de la clasificación.'); }
    return inj;
  }
  function called(st) { return st === 'tit' || st === 'conv' || st === 'p1' || st === 'p2'; }
  /** Estado que da la nota de ahora frente a los cortes de la fuerza S de tu país. */
  function cutOf(c, sc, S) {
    var hl = hall(c);
    return sc >= S + CUT.tit ? (hl ? 'tit' : 'p1') : sc >= S + CUT.conv ? (hl ? 'conv' : 'p2') : sc >= S + CUT.pre ? 'pre' : 'out';
  }
  /** Para la interfaz: {st, score, S, cut: {tit, conv, pre}, gap, tip} del verano que viene (sin tiradas). */
  function status(c) {
    var n = ensure(c), cyc = cycOf(c, c.season), S = Sof(c, n.cc, cyc), sc = scoreOf(c), st = injured(c) ? 'inj' : cutOf(c, sc, S);
    var cut = { tit: S + CUT.tit, conv: S + CUT.conv, pre: S + CUT.pre };
    var goal = st === 'tit' || st === 'p1' ? 0 : called(st) ? cut.tit : cut.conv;
    return { st: st, score: sc, S: S, cut: cut, gap: goal ? round1(Math.max(0, goal - sc)) : 0, tip: tipOf(c) };
  }
  /** Consejo según lo más flojo: la nota de la temporada, la liga o la fama. */
  function tipOf(c) {
    var E = K(c), nt = E.avgNota(c), lv = ligaLvl(c), fi = fameIdx(c);
    if (nt != null && nt < 6.8) return 'Sube la media de notas: es lo que más mira.';
    if (lv <= 1) return 'Una liga mejor te acerca a la lista.';
    if (fi <= 2) return 'La fama también cuenta: gana partidos y títulos.';
    return 'Sigue así: cada punto de media suma.';
  }
  var ST_TXT = { out: 'Sin convocar', pre: 'Prelista', conv: 'Convocado', tit: 'Titular', p2: 'Pareja 2', p1: 'Pareja 1', inj: 'Lesionado' };
  function stText(st) { return ST_TXT[st] || ST_TXT.out; }
  /** Seleccionador (inventado) del ciclo: el mismo nombre durante los 4 veranos. */
  function coachName(c, cc, cyc) { var H = VB.Career && VB.Career.hall; return H && H._name ? H._name(R(c, 'coach', cc, cyc)) : 'Seleccionador'; }
  function chemB(n) { return n.chem < 35 ? 0 : n.chem < 70 ? 1 : 2; }
  function chemTxt(n) { return n.chem < 35 ? 'Química baja' : n.chem < 70 ? 'Química media' : 'Química alta'; }
  /** Nuevo ciclo: seleccionador nuevo y la confianza vuelve a medio camino de 50. */
  function cycleCheck(c, cyc) {
    var n = ensure(c);
    if (n.cyc === cyc) return false;
    if (n.cyc >= 0) n.trust = Math.round(50 + (n.trust - 50) / 2);
    n.cyc = cyc; return true;
  }

  // ------------------------------------------------------------------ clasificación, grupos y calendario
  function poolOf(c, ev, cc) {
    var reg = natOf(cc).region;
    return ev === 'cont' ? CODES.filter(function (x) { return natOf(x).region === reg; }) : CODES.slice();
  }
  function sizeOf(ev, pool) {
    if (ev !== 'cont') return EV[ev].T;
    return pool.length >= 16 ? 16 : pool.length >= 8 ? 8 : 4;
  }
  function hostOf(c, s, ev, pool, cyc) {
    var top = ranked(c, pool, cyc).slice(0, Math.min(20, pool.length));
    return top[hsh(c.seed, 'natl-host', s, ev) % top.length];
  }
  /** Plazas: {T, host, direct, rep} del torneo del verano s (sin la repesca resuelta). */
  function fieldOf(c, s) {
    var n = ensure(c), ev = evOf(c, s), cyc = cycOf(c, s), pool = poolOf(c, ev, n.cc), T = sizeOf(ev, pool), host = hostOf(c, s, ev, pool, cyc);
    var order = [host];
    if (ev === 'wc') REGIONS.forEach(function (rg) { var b = ranked(c, pool.filter(function (x) { return natOf(x).region === rg; }), cyc)[0]; if (b && order.indexOf(b) < 0) order.push(b); });
    ranked(c, pool, cyc).forEach(function (x) { if (order.indexOf(x) < 0) order.push(x); });
    var hasRep = EV[ev].rep && order.length >= T + 2;
    return { ev: ev, cyc: cyc, T: T, host: host, direct: order.slice(0, hasRep ? T - 1 : T), rep: hasRep ? order.slice(T - 1, T + 2) : null };
  }
  /** Repesca simulada (todos contra todos a un partido): ganador. */
  function repSim(c, s, rep, cyc) {
    var tab = {}; rep.forEach(function (x) { tab[x] = { p: 0, sd: 0, pd: 0 }; });
    [[0, 1], [0, 2], [1, 2]].forEach(function (p, j) {
      var a = rep[p[0]], b = rep[p[1]], r = R(c, 'rep', s, j), q = simSets(c, Sof(c, a, cyc), Sof(c, b, cyc), r);
      var wA = q.s[0] > q.s[1];
      tab[a].p += wA ? 2 : 1; tab[b].p += wA ? 1 : 2; tab[a].sd += q.s[0] - q.s[1]; tab[b].sd += q.s[1] - q.s[0];
      var pa = 0, pb = 0; q.sc.forEach(function (x) { pa += x[0]; pb += x[1]; }); tab[a].pd += pa - pb; tab[b].pd += pb - pa;
    });
    return rep.slice().sort(function (a, b) { return tab[b].p - tab[a].p || tab[b].sd - tab[a].sd || tab[b].pd - tab[a].pd || rkScore(c, b, cyc) - rkScore(c, a, cyc); })[0];
  }
  function groupsOf(c, teams, host, cyc) {
    var G = teams.length / 4, rest = ranked(c, teams.filter(function (x) { return x !== host; }), cyc), order = [host].concat(rest), gs = [];
    for (var g = 0; g < G; g++) gs.push([]);
    order.forEach(function (x, i) { var row = Math.floor(i / G), col = i % G; gs[row % 2 === 0 ? col : G - 1 - col].push(x); });
    return gs;
  }
  var GPAIRS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  function addFx(w, r, a, b) { var f = { i: w.fx.length, r: r, a: a, b: b, res: null }; w.fx.push(f); return f; }

  // ------------------------------------------------------------------ simulación de partidos
  /** Sets con fuerzas A y B (pista: logística /5; playa: /4), al mejor de 3 (el 3r a 15), con la puntuación de la carrera. */
  function simSets(c, A, Bv, r, pts) {
    var hl = hall(c), P = pts || (hl ? (+c.points || 25) : (K(c).PTS || 21)), p = 1 / (1 + Math.exp(-(A - Bv) / (hl ? 5 : 4))), s = [0, 0], sc = [];
    while (s[0] < 2 && s[1] < 2) {
      var tgt = s[0] + s[1] === 2 ? Math.min(15, P) : P, aw = r() < p, wv = tgt, lv;
      if (r() < 0.15) { wv = tgt + 1 + Math.floor(r() * 3); lv = wv - 2; }
      else lv = tgt - 10 + Math.floor(r() * 9);
      lv = clamp(lv, 0, wv - 2);
      sc.push(aw ? [wv, lv] : [lv, wv]); s[aw ? 0 : 1]++;
    }
    return { s: s, sc: sc };
  }
  /** Fuerza de la selección cc en la ventana w (anfitrión +2; con tu jugador, tu media y la química). */
  function teamStr(c, w, cc, meOn) {
    var cyc = cycOf(c, w.s), S = Sof(c, cc, cyc), v = S + (cc === w.host ? 2 : 0);
    if (meOn && cc === w.my) {
      // (pista: eres 1 de 6; playa: la mitad de la pareja)
      var ovr = K(c).playerOvr(c), k = hall(c) ? 0.2 : 0.5;
      v += clamp((ovr - S) * k, hall(c) ? -2 : -5, hall(c) ? 3 : 8) + 0.5 * chemB(c.natl);
    }
    return v;
  }
  function isMine(w, f) { return f.a === w.my || f.b === w.my; }
  /** Resultado simulado del partido f (desde a). Con meOn y tu selección: también tu nota simulada y unas estadísticas. */
  function simRes(c, w, f, meOn) {
    var r = R(c, 'fx', w.id, f.i), on = !!(meOn && isMine(w, f));
    var q = simSets(c, teamStr(c, w, f.a, on), teamStr(c, w, f.b, on), r);
    var res = { s: q.s, sc: q.sc, me: null };
    if (isMine(w, f)) {
      if (on) {
        var mineA = f.a === w.my, win = mineA ? q.s[0] > q.s[1] : q.s[1] > q.s[0], S = Sof(c, w.my, cycOf(c, w.s)), ovr = K(c).playerOvr(c);
        var nota = round1(clamp(6.3 + (ovr - S) * 0.06 + (win ? 0.5 : -0.3) + (r() - 0.5) * 1.6, 4, 9.2));
        res.me = { on: 1, played: 0, nota: nota, xp: 0, k: Math.round(r() * 8 + (hall(c) ? 3 : 8)), ac: Math.round(r() * 2), bl: Math.round(r() * 2), dg: Math.round(r() * 6 + 2) };
      } else res.me = { on: 0, played: 0 };
    }
    return res;
  }
  function winner(f) { return f.res ? (f.res.s[0] > f.res.s[1] ? f.a : f.b) : null; }
  function loser(f) { return f.res ? (f.res.s[0] > f.res.s[1] ? f.b : f.a) : null; }
  /** Tabla de un grupo: [{cc, pj, g, p, sf, sc, pf, pc, pts}] ordenada (puntos, sets, tantos, ranking). */
  function groupTable(c, w, gi) {
    var grp = w.groups[gi] || [], rows = {}, cyc = cycOf(c, w.s), hl = hall(c);
    grp.forEach(function (x) { rows[x] = { cc: x, pj: 0, g: 0, p: 0, sf: 0, sc: 0, pf: 0, pc: 0, pts: 0 }; });
    w.fx.forEach(function (f) {
      if (!f.res || f.r.charAt(0) !== 'g' || !rows[f.a] || !rows[f.b]) return;
      var A = rows[f.a], Bv = rows[f.b], s = f.res.s, aw = s[0] > s[1];
      A.pj++; Bv.pj++; A.sf += s[0]; A.sc += s[1]; Bv.sf += s[1]; Bv.sc += s[0];
      f.res.sc.forEach(function (x) { A.pf += x[0]; A.pc += x[1]; Bv.pf += x[1]; Bv.pc += x[0]; });
      var W = aw ? A : Bv, Lr = aw ? Bv : A; W.g++; Lr.p++;
      if (hl) { var close = s[0] + s[1] === 3; W.pts += close ? 2 : 3; Lr.pts += close ? 1 : 0; } else { W.pts += 2; Lr.pts += 1; }
    });
    return grp.map(function (x) { return rows[x]; }).sort(function (a, b) {
      return b.pts - a.pts || (b.sf - b.sc) - (a.sf - a.sc) || (b.pf - b.pc) - (a.pf - a.pc) || rkScore(c, b.cc, cyc) - rkScore(c, a.cc, cyc);
    });
  }
  function stageOf(r) { return r === 'b' ? 'f' : r; }
  function stageFx(w, st) { return w.fx.filter(function (f) { return stageOf(f.r) === st; }); }
  /** Monta la fase siguiente (o cierra el torneo). */
  function nextStage(c, w) {
    var st = w.stage, G = w.kind === 'sum' ? w.groups.length : 0;
    if (w.kind === 'q') { if (st === 'q1') { w.stage = 'q2'; return; } finish(c, w); return; }
    if (st === 'g1' || st === 'g2') { w.stage = st === 'g1' ? 'g2' : 'g3'; return; }
    if (st === 'g3') {
      var T = w.groups.map(function (g, i) { return groupTable(c, w, i); });
      if (G === 1) { addFx(w, 'f', T[0][0].cc, T[0][1].cc); addFx(w, 'b', T[0][2].cc, T[0][3].cc); w.stage = 'f'; }
      else if (G === 2) { addFx(w, 'sf', T[0][0].cc, T[1][1].cc); addFx(w, 'sf', T[1][0].cc, T[0][1].cc); w.stage = 'sf'; }
      else { addFx(w, 'qf', T[0][0].cc, T[1][1].cc); addFx(w, 'qf', T[2][0].cc, T[3][1].cc); addFx(w, 'qf', T[1][0].cc, T[0][1].cc); addFx(w, 'qf', T[3][0].cc, T[2][1].cc); w.stage = 'qf'; }
    } else if (st === 'qf') {
      var q = stageFx(w, 'qf'); addFx(w, 'sf', winner(q[0]), winner(q[1])); addFx(w, 'sf', winner(q[2]), winner(q[3])); w.stage = 'sf';
    } else if (st === 'sf') {
      var sf = stageFx(w, 'sf'); addFx(w, 'f', winner(sf[0]), winner(sf[1])); addFx(w, 'b', loser(sf[0]), loser(sf[1])); w.stage = 'f';
    } else if (st === 'f') { finish(c, w); return; }
    if (w.kind === 'sum' && !stageFx(w, w.stage).some(function (f) { return isMine(w, f); })) w.out = 1;   // (tu selección ya no sigue)
  }
  /** Descanso del convocado en la fase de grupos (uno de los 3 partidos) y si juega una eliminatoria. */
  function restIdx(c, w) { return hsh(c.seed, 'natl-rest', w.id) % 3; }
  function plays(c, w, f) {
    if (!w.on || w.dec || !isMine(w, f)) return false;
    if (w.st === 'conv') {
      if (/^g[123]$/.test(f.r)) return f.r !== 'g' + (restIdx(c, w) + 1);
      if (/^q[12]$/.test(f.r)) return true;   // (clasificación; los cuartos, 'qf', van por la confianza)
      return c.natl.trust >= 60 || c.natl.lastN >= 7.0;
    }
    return true;
  }
  /** Tu partido pendiente de la fase actual (o null). */
  function pendingMine(w) {
    if (!w || w.stage === 'done' || !w.on || w.dec) return null;
    var l = stageFx(w, w.stage).filter(function (f) { return isMine(w, f) && !f.res; });
    return l[0] || null;
  }
  /** Avanza el torneo: simula lo que falta de cada fase. Se para en tu partido pendiente salvo con force. */
  function advance(c, w, force) {
    var g = 0;
    while (w.stage !== 'done' && g++ < 24) {
      var fx = stageFx(w, w.stage);
      for (var i = 0; i < fx.length; i++) {
        var f = fx[i]; if (f.res) continue;
        if (isMine(w, f)) {
          if (!force && w.on && !w.dec) return;
          var on = plays(c, w, f);
          f.res = simRes(c, w, f, on);
          if (on) applyMine(c, w, f, { played: 0, nota: f.res.me.nota, k: f.res.me.k, a: f.res.me.ac, b: f.res.me.bl, d: f.res.me.dg, win: winner(f) === w.my });
        } else f.res = simRes(c, w, f, false);
      }
      nextStage(c, w);
    }
  }

  // ------------------------------------------------------------------ tus partidos: efectos
  function addFame(c, v, why) { var Lf = L(); if (!Lf || !Lf.addFame || !(v > 0)) return 0; try { return Lf.addFame(c, v, why) | 0; } catch (e) { return 0; } }
  function msg(c, t, x) { try { return K(c)._msg(c, 'natl', t, x); } catch (e) { return null; } }
  /** Lo tuyo tras un partido con la selección (jugado o simulado contigo): partidos, confianza, química, fama, debut, fatiga. */
  function applyMine(c, w, f, o) {
    var n = ensure(c), car = n.car, nat = natOf(w.my), ko = /^(qf|sf|f|b)$/.test(f.r), played = o.played ? 1 : 0;
    car.caps++; car.starts++; if (o.win) car.w++; else car.l++;
    car.kills += o.k | 0; car.aces += o.a | 0; car.blocks += o.b | 0; car.digs += o.d | 0; car.nS = round1(car.nS + o.nota); car.nN++;
    n.lastN = o.nota; if (f.r === 'f') n.fin++;
    w.mt.n++; w.mt.sum = round1(w.mt.sum + o.nota); if (played) w.mt.pl = (w.mt.pl | 0) + 1;
    n.trust = clamp(Math.round(n.trust + ((o.nota - 6.5) * 6 + (o.win ? 2 : 0)) * (played ? 1 : 0.5)), 0, 100);
    n.chem = clamp(n.chem + (played ? 12 : 6), 0, 100);
    var fe = FAME_EV[w.kind === 'q' ? 'q' : w.ev] || 8, fb = (Math.max(0, o.nota - 5.5) * 22 + (o.win ? 18 : 0) + (ko ? 30 : 0)) * fe * (played ? 1 : 0.33);
    var got = addFame(c, fb, 'Selección');
    if (car.caps === 1) {
      car.debut = w.s | 0; got += addFame(c, 300, 'Debut con la selección');
      msg(c, 'Debut con ' + nat.name, 'Tu primer partido con la selección. 300 seguidores nuevos te siguen desde hoy.');
    }
    if (w.kind === 'q') { c.fatigue = clamp((c.fatigue | 0) + (played ? 6 : 3), 0, 100); injRoll(c, w); }
    return got;
  }

  // ------------------------------------------------------------------ abrir y cerrar torneos
  function roleOf(w) {
    if (w.dec) return 'Descanso';
    if (w.nq && called(w.st)) return stText(w.st);   // (tu país se quedó sin billete: tu papel en la lista sigue siendo el tuyo)
    if (!w.on) return w.st === 'p2' ? 'Pareja 2 (no va)' : w.st === 'inj' ? 'Lesionado' : w.st === 'pre' ? 'Prelista' : 'Sin convocar';
    return stText(w.st);
  }
  /** Ventana de verano del torneo de la temporada s (gancho 'season'). */
  function openSum(c, s, force) {
    var n = ensure(c), F = fieldOf(c, s), cyc = F.cyc, ei = evInfo(c, F.ev, n.cc), nat = natOf(n.cc);
    var teams = F.direct.slice(), repW = null, q = n.q[s];
    if (F.rep) { repW = q && q.ev === F.ev && F.rep.indexOf(q.w) >= 0 ? q.w : repSim(c, s, F.rep, cyc); teams.push(repW); }
    var w = { id: ++n.n, kind: 'sum', ev: F.ev, s: s | 0, name: ei.name, host: F.host, T: F.T, my: n.cc, st: 'out', sur: 0, on: 0, dec: 0,
      teams: teams, groups: groupsOf(c, teams, F.host, cyc), rep: F.rep, repW: repW, fx: [], stage: 'g1', out: 0, nq: teams.indexOf(n.cc) < 0 ? 1 : 0, mt: { n: 0, sum: 0 } };
    w.groups.forEach(function (g) { GPAIRS.forEach(function (rd, j) { rd.forEach(function (p) { addFx(w, 'g' + (j + 1), g[p[0]], g[p[1]]); }); }); });
    // convocatoria
    var sc = scoreOf(c), S = Sof(c, n.cc, cyc), prev = n.st; cycleCheck(c, cyc);
    var st = ST.indexOf(force) >= 0 ? force : injured(c) ? 'inj' : cutOf(c, sc, S);
    if (!force && st === 'pre' && R(c, 'sur', s, w.id)() < 0.2) { st = hall(c) ? 'conv' : 'p2'; w.sur = 1; }
    w.st = st; n.st = st; n.stS = s | 0;
    w.on = called(st) && !w.nq && !(st === 'p2' && (F.ev === 'wc' || F.ev === 'games')) ? 1 : 0;
    n.win = w;
    var coach = coachName(c, n.cc, cyc), pre = cap1(theEv(ei)), hostT = natOf(F.host).name;
    if (w.nq) {
      msg(c, nat.name + ' no estará ' + enEv(ei), 'La selección se queda fuera ' + deEv(ei) + '. ' + nextLine(c, s));
    } else if (w.on) {
      if (!hall(c) && !n.lock) n.lock = 1;
      addFame(c, 100, 'Convocatoria');
      var f0 = w.fx.filter(function (f) { return isMine(w, f); })[0], riv = f0 ? natOf(f0.a === w.my ? f0.b : f0.a).name : '';
      var role = st === 'tit' ? 'Vas de titular.' : st === 'p1' ? 'Vas como Pareja 1.' : st === 'p2' ? 'Vas como Pareja 2.' : 'Vas en la lista.';
      if (w.sur) msg(c, 'Llamada de última hora', 'Una baja te abre la puerta: vas ' + aEv(ei) + ' con ' + nat.name + '.' + (n.youth ? ' Ya jugaste con la sub-19.' : ''));
      else msg(c, '¡Convocatoria con ' + nat.name + '!', coach + ' te llama para ' + theEv(ei) + ' en ' + hostT + '. ' + role + (riv ? ' Primer partido: ' + nat.name + ' contra ' + riv + '.' : '') + (n.youth ? ' Ya jugaste con la sub-19.' : ''));
      storyCall(c, w, ei);
    } else {
      if (st === 'pre') msg(c, 'Estás en la prelista', coach + ' te tiene en la lista larga de ' + nat.name + ' para ' + theEv(ei) + '. Te faltan ' + dec(Math.max(0.1, S + CUT.conv - sc)) + ' puntos. Sube la media y vuelve a mirar en verano.');
      else if (st === 'p2') msg(c, 'Sin plaza ' + enEv(ei), aEv(ei).charAt(0).toUpperCase() + aEv(ei).slice(1) + ' va la Pareja 1 de ' + nat.name + '. Esta vez lo ves desde casa.');
      else if (st === 'inj') msg(c, 'Fuera por lesión', 'La lesión te deja fuera ' + deEv(ei) + '. El seleccionador cuenta contigo para la próxima.');
      else if (called(prev)) msg(c, 'Fuera de la lista', 'Esta vez no entras en la lista de ' + nat.name + '. El seleccionador quiere verte con más minutos.');
      n.chem = clamp(n.chem - 10, 0, 100);
    }
    if (!w.on) advance(c, w, true);
    return w;
  }
  function nextLine(c, s) { var ei = evInfo(c, evOf(c, s + 1)); return 'El próximo verano toca ' + theEv(ei) + '.'; }
  /** Puestos finales: lista de códigos del 1º al último. */
  function placesOf(c, w) {
    var out = [], f = stageFx(w, 'f'), F = f.filter(function (x) { return x.r === 'f'; })[0], Bz = f.filter(function (x) { return x.r === 'b'; })[0];
    if (F && F.res) { out.push(winner(F), loser(F)); }
    if (Bz && Bz.res) { out.push(winner(Bz), loser(Bz)); }
    var cyc = cycOf(c, w.s), gt = w.groups.map(function (g, i) { return groupTable(c, w, i); });
    var gp = {}; gt.forEach(function (t) { t.forEach(function (r, i) { gp[r.cc] = { pos: i, pts: r.pts, sd: r.sf - r.sc }; }); });
    var by = function (a, b) { return gp[b].pts - gp[a].pts || gp[b].sd - gp[a].sd || rkScore(c, b, cyc) - rkScore(c, a, cyc); };
    var qfL = stageFx(w, 'qf').map(loser).filter(Boolean).sort(by);
    out = out.concat(qfL);
    [0, 1, 2, 3].forEach(function (p) { out = out.concat(w.teams.filter(function (x) { return gp[x] && gp[x].pos === p && out.indexOf(x) < 0; }).sort(by)); });
    return out;
  }
  function resText(pos, w) {
    if (pos === 1) return 'Oro'; if (pos === 2) return 'Plata'; if (pos === 3) return 'Bronce'; if (pos === 4) return '4ª';
    return pos <= 8 && w.T === 16 ? 'Cuartos' : 'Grupos';
  }
  /** Cierre del torneo: medallas, trofeos, premios, ranking, historial y mensajes. */
  function finish(c, w) {
    var n = ensure(c);
    if (w.kind === 'q') { finishQ(c, w); return; }
    w.stage = 'done';
    var pl = placesOf(c, w), ei = { name: w.name, art: evInfo(c, w.ev, w.my).art }, nat = natOf(w.my), cyc = cycOf(c, w.s);
    pl.forEach(function (x, i) { var p = i + 1, pts = RK_PTS[p] || (p <= 8 && w.T === 16 ? 10 : 3); n.rk[x] = round1((+n.rk[x] || 0) * 0.7 + pts); });
    var pos = pl.indexOf(w.my) + 1, champ = natOf(pl[0]).name, mt = w.mt, avg = mt.n ? round1(mt.sum / mt.n) : null;
    w.pos = pos; w.champ = pl[0];
    var D = K(c).diffOf ? K(c).diffOf(c) : 'normal';
    if (w.on && pos > 0) {
      var medal = pos <= 3, full = mt.n > 0 ? 1 : 0.5;
      if (medal) {
        var mk = pos === 1 ? 'g' : pos === 2 ? 's' : 'b', mname = pos === 1 ? 'Oro' : pos === 2 ? 'Plata' : 'Bronce';
        n.med[mk]++;
        var tname = pos === 1 ? w.name : mname + ' ' + enEv(ei);
        (c.trophies = Array.isArray(c.trophies) ? c.trophies : []).push({ season: w.s | 0, kind: pos === 1 ? 'sel' : 'selm', name: tname, club: nat.name, d: D, med: 4 - pos, ev: w.ev });
        var fm = Math.round(EV[w.ev].fame * (pos === 1 ? 1 : pos === 2 ? 0.5 : 0.3) * full);
        addFame(c, fm, 'Medalla con la selección');
        msg(c, '¡' + mname + ' ' + enEv(ei) + '!', nat.name + ' se cuelga ' + (pos === 1 ? 'el oro' : pos === 2 ? 'la plata' : 'el bronce') + '. Vuelves a casa con una medalla y ' + num(fm) + ' seguidores más.' +
          (w.auto ? ' Firmaste antes del final: el resto se ha simulado.' : ''));
        storyMedal(c, w, mname);
      } else if (w.auto) {
        msg(c, 'El torneo acabó sin ti en pantalla', 'Firmaste antes del final: el resto ' + deEv(ei) + ' se ha simulado. ' + nat.name + ' termina ' + ordF(pos) + '.');
      } else {
        var where = pos === 4 ? 'en el partido por el bronce' : pos <= 8 && w.T === 16 ? 'en cuartos' : w.T >= 8 && pos <= 4 ? 'en semifinales' : 'en la fase de grupos';
        msg(c, nat.name + ' cae ' + where, 'Se acaba ' + theEv(ei) + '. ' + champ + ' se lleva el oro. Toca volver al club.');
      }
      // premios del torneo (3 partidos o más)
      if (mt.n >= 3 && avg != null) {
        var aw = [];
        if ((pos === 1 && avg >= 7.5) || avg >= 8.2) aw.push({ n: 'MVP ' + deEv(ei), t: 'Mejor jugador del torneo. Nota media: ' + dec(avg) + '.', mvp: 1 });
        if (avg >= 7.3) aw.push({ n: 'Mejor ' + posWord(c) + ' ' + deEv(ei), t: 'El mejor de tu puesto en el torneo. Nota media: ' + dec(avg) + '.', mvp: 0 });
        aw.forEach(function (a) {
          c.trophies.push({ season: w.s | 0, kind: 'selp', name: a.n, club: nat.name, d: D, med: 0, ev: w.ev });
          addFame(c, 800 * (FAME_EV[w.ev] / 10), 'Premio del torneo');
          msg(c, a.n, a.t);
        });
      }
    } else if (!w.nq) {
      msg(c, champ + ' gana ' + theEv(ei), nat.name + ' termina ' + ordF(pos) + '. ' + (w.dec ? 'Este verano tocaba descansar.' : 'Tú lo ves desde casa.'));
    }
    n.hist.push({ s: w.s | 0, ev: w.ev, name: w.name, res: w.nq ? 'Sin billete' : resText(pos, w), pos: pos, st: roleOf(w), caps: mt.n | 0, nota: avg });
    if (n.hist.length > HIST_MAX) n.hist = n.hist.slice(-HIST_MAX);
  }
  function posWord(c) {
    if (hall(c)) { var H = VB.Career.hall, p = H && H.ctrlRole ? H.ctrlRole(c) : 'OH', P = (VB.Career.POS6 || {})[p]; return (P ? P.name : 'Receptor').toLowerCase(); }
    return c.player && c.player.roleKey === 'cr' ? 'defensa' : 'atacante';
  }
  /** Cierre de la repesca en temporada: billete o no (n.q[s] para el verano). */
  function finishQ(c, w) {
    var n = ensure(c), tab = {}, cyc = cycOf(c, w.s), ei = { name: w.name, art: evInfo(c, w.ev, w.my).art };
    w.stage = 'done';
    w.teams.forEach(function (x) { tab[x] = { p: 0, w: 0, sd: 0, pd: 0 }; });
    w.fx.forEach(function (f) {
      if (!f.res) return; var aw = f.res.s[0] > f.res.s[1], A = tab[f.a], Bv = tab[f.b];
      A.p += aw ? 2 : 1; Bv.p += aw ? 1 : 2; if (aw) A.w++; else Bv.w++;
      A.sd += f.res.s[0] - f.res.s[1]; Bv.sd += f.res.s[1] - f.res.s[0];
      f.res.sc.forEach(function (x) { A.pd += x[0] - x[1]; Bv.pd += x[1] - x[0]; });
    });
    // (pasa la 1ª de la tabla: puntos, sets, tantos y ranking; la misma que se ve en la tarjeta)
    var order = w.teams.slice().sort(function (a, b) { return tab[b].p - tab[a].p || tab[b].sd - tab[a].sd || tab[b].pd - tab[a].pd || rkScore(c, b, cyc) - rkScore(c, a, cyc); });
    var wn = order[0], ok = wn === w.my;
    w.qOk = ok ? 1 : 0; w.qW = wn;
    n.q[w.s] = { ev: w.ev, w: wn };
    Object.keys(n.q).forEach(function (k) { if ((+k) < (w.s | 0) - 1) delete n.q[k]; });
    var nat = natOf(w.my), tgt = evInfo(c, w.ev, w.my);
    if (ok) msg(c, '¡Billete para ' + theEv(tgt) + '!', nat.name + ' gana la repesca y estará ' + enEv(tgt) + ' este verano.');
    else msg(c, 'Sin billete', nat.name + ' se queda fuera ' + deEv(tgt) + '. Pasa ' + natOf(wn).name + '.');
    if (w.mt.n) n.hist.push({ s: w.s | 0, ev: 'q', name: 'Repesca ' + deEv(ei), res: ok ? 'Billete' : 'Sin billete', pos: 0, st: roleOf(w), caps: w.mt.n | 0, nota: w.mt.n ? round1(w.mt.sum / w.mt.n) : null });
    n.win = null;
  }
  /** Ventana de clasificación a mitad de liga (pista): tu país está en la repesca del torneo de este verano. */
  function openQ(c) {
    var n = ensure(c), s = c.season | 0, F = fieldOf(c, s);
    if (!F.rep || F.rep.indexOf(n.cc) < 0 || n.q[s] || n.qS === s) return null;
    n.qS = s;
    var cyc = F.cyc, ei = evInfo(c, F.ev, n.cc), others = F.rep.filter(function (x) { return x !== n.cc; });
    var w = { id: ++n.n, kind: 'q', ev: F.ev, s: s, name: ei.name, host: '', T: 3, my: n.cc, st: 'out', sur: 0, on: 0, dec: 0, teams: F.rep.slice(), groups: [], rep: null,
      fx: [], stage: 'q1', out: 0, nq: 0, wk: c.week | 0, exp: (c.week | 0) + 1, mt: { n: 0, sum: 0 } };
    addFx(w, 'q1', n.cc, others[0]); addFx(w, 'q2', n.cc, others[1]); addFx(w, 'q2', others[0], others[1]);
    var sc = scoreOf(c), S = Sof(c, n.cc, cyc); cycleCheck(c, cyc);
    var st = injured(c) ? 'inj' : cutOf(c, sc, S);
    w.st = st; w.on = called(st) ? 1 : 0; n.st = st; n.stS = s;
    n.win = w;
    var nat = natOf(n.cc);
    if (w.on) msg(c, 'Ventana de selecciones', nat.name + ' se juega el billete para ' + theEv(ei) + ': dos partidos antes de la jornada ' + w.exp + '. ' + coachName(c, n.cc, cyc) + ' cuenta contigo.');
    else { advance(c, w, true); }
    return w;
  }

  // ------------------------------------------------------------------ ganchos (VB.CareerExt)
  function hook(c, kind, a, b) {
    if (OFF || !c) return;
    if (kind === 'create') { ensure(c); return; }
    var n = ensure(c);
    if (kind === 'season') {
      if (n.win && n.win.stage !== 'done') { n.win.auto = 1; advance(c, n.win, true); }
      if (n.win && n.win.kind === 'q') n.win = null;
      openSum(c, c.season | 0);
    } else if (kind === 'match') {
      if (!hall(c)) return;
      var w = n.win;
      if (w && w.kind === 'q' && w.stage !== 'done' && ((c.week | 0) !== w.wk || c.phase !== 'league')) { w.auto = 1; advance(c, w, true); }
      if (b && b.kind === 'league' && c.phase === 'league' && (!n.win || n.win.kind !== 'q')) {
        var H = K(c); if (H.midWeek && (c.week | 0) >= H.midWeek(c) && n.qS !== (c.season | 0)) openQ(c);
      }
    } else if (kind === 'newSeason') {
      var v = n.win;
      if (v && v.stage !== 'done') { v.auto = 1; advance(c, v, true); }
      n.win = null;
    }
  }

  // ------------------------------------------------------------------ partido jugado (setup / done)
  function pressOf(f) { return /^g/.test(f.r) ? 1 : f.r === 'qf' || /^q/.test(f.r) ? 2 : 3; }
  var RND_TXT = { qf: 'Cuartos de final', sf: 'Semifinal', f: 'Final', b: 'Por el bronce', q1: 'Clasificación, 1r partido', q2: 'Clasificación, 2º partido' };
  function roundLabel(w, f) {
    if (/^g/.test(f.r)) { var gi = -1; w.groups.forEach(function (g, i) { if (g.indexOf(f.a) >= 0) gi = i; }); return 'Grupo ' + 'ABCD'.charAt(Math.max(0, gi)) + ', ' + ordF(+f.r.charAt(1)) + ' jornada'; }
    return RND_TXT[f.r] || '';
  }
  function curC(arg) {
    var C = VB.Career; if (!C) return null;
    var c = arg && arg.mode ? (arg.mode === 'hall' ? C.hall : C.beach).load() : C.get();
    return c || null;
  }
  /** Paso de la IA rival por la fuerza de su selección y la dificultad de la carrera (como rivalAI6). */
  function aiOf(c, rv, cyc) {
    var E = K(c), v = str(c, rv, cyc), b = v >= 85 ? 4 : v >= 75 ? 3 : v >= 62 ? 2 : v >= 55 ? 1 : 0, D = (E.CDIFF || {})[E.diffOf ? E.diffOf(c) : 'normal'] || { shift: 0 };
    var steps = E.STEPS || [{ d: 'easy', soft: false }, { d: 'normal', soft: true }, { d: 'normal', soft: false }, { d: 'hard', soft: false }, { d: 'expert', soft: false }];
    var s = clamp(b + (D.shift | 0), 0, steps.length - 1); if (D.noSoft && s === 1) s = 2;
    var st = steps[s], nm = (VB.DIFF && VB.DIFF[st.d] && VB.DIFF[st.d].name) || st.d;
    return { diff: st.d, soft: !!st.soft, name: st.soft ? nm + ' suave' : nm };
  }
  function venueOf(c, w, f) {
    var V = VB.Venues; if (!V) return null;
    try {
      var fin = f.r === 'f' || f.r === 'b', E = V.EMBLEM || {};
      if (!hall(c)) { var id = fin ? E.beachFinal : (E.beachOpen || [])[4]; return id && V.ready && V.ready(id) ? id : null; }
      if (fin && E.intlFinal && V.ready && V.ready(E.intlFinal)) return E.intlFinal;
      var h = natOf(w.host || w.my), k = h.club || { name: 'Pabellón Nacional de ' + h.name, short: h.ab, city: h.name, cc: h.cc, lvl: 1, strength: 95 };
      return V.forClub ? V.forClub(k, 'hall', { stage: 'intl' }) || null : null;
    } catch (e) { return null; }
  }
  /** Opciones del partido f de la ventana (arg = {w, i, mode}) para startMatch (main.js startCareerExt). Reentrante: no guarda nada. */
  function setup(arg) {
    if (OFF) return null;
    var c = curC(arg); if (!c) return null;
    var n = ensure(c), w = n.win; if (!w || !arg || w.id !== arg.w || w.stage === 'done') return null;
    var f = w.fx[arg.i | 0]; if (!f || f.res || !isMine(w, f) || stageOf(f.r) !== w.stage || !plays(c, w, f)) return null;
    var E = K(c), hl = hall(c), cyc = cycOf(c, w.s), rv = f.a === w.my ? f.b : f.a, me = natOf(w.my), them = natOf(rv);
    var S = Sof(c, w.my, cyc) + (w.host === w.my ? 2 : 0), Rv = Sof(c, rv, cyc) + (w.host === rv ? 2 : 0);
    var r = R(c, 'setup', w.id, f.i), D = (E.CDIFF || {})[E.diffOf(c)] || { attr: 0 }, KEYS = ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];
    var CH = ['react', 'set', 'recv'], cb = chemB(n), press = pressOf(f), nerves = n.car.caps < 3 || (f.r === 'f' && !n.fin) ? press : 0, vet = n.car.caps >= 15 && press === 3 ? 1 : 0;
    var fm = w.kind === 'q' && E.fatigueMalus ? E.fatigueMalus(c) : 0;
    var stMe = JSON.parse(JSON.stringify(c.player.st));
    KEYS.forEach(function (k) { stMe[k] = clamp(Math.round(stMe[k] - fm + (CH.indexOf(k) >= 0 ? cb : 0) - ((k === 'ctl' || k === 'serve') ? nerves : 0) + (k === 'ctl' ? vet : 0)), 1, 99); });
    var bd = VB.Badges && VB.Badges.forPlayer ? VB.Badges.forPlayer(c.player) : null; if (bd && !Object.keys(bd).length) bd = null;
    var nm = function () { var H = VB.Career.hall; return H && H._name ? H._name(r) : 'Jugador'; };
    var used = {}; used[c.player.num | 0] = 1; used[13] = 1;
    var freeNum = function () { var x = 1 + Math.floor(r() * 24); while (used[x]) x = x % 99 + 1; used[x] = 1; return x; };
    var ai = aiOf(c, rv, cyc), gs = E.genSt || E._genSt, out;
    var cs = { ext: 'natl', mode: hl ? 'hall' : 'beach', natl: w.id, fx: f.i, season: c.season, phase: c.phase, week: c.week | 0, round: f.i,
      label: w.name + ', ' + low1(roundLabel(w, f)), me: me.ab, rival: them.ab, meName: me.name, rivalName: them.name,
      player: c.player.name, num: c.player.num, press: press, venue: hl ? 'hall' : 'beach', cdiff: E.diffOf(c), atHome: w.host === w.my,
      amb: { home: w.host === w.my ? 0 : w.host === rv ? 1 : -1, heat: clamp(0.4 + 0.12 * press, 0, 0.9), level: 'top', tags: f.r === 'f' ? ['final'] : f.r === 'sf' ? ['semi'] : [],
        city: natOf(w.host || w.my).name, venue: natOf(w.host || w.my).name, short: [me.name, them.name] } };
    if (hl) {
      var H = VB.Career.hall, Rr = H.simRoles(), role = H.ctrlRole(c), idx = Rr.indexOf(role); if (idx < 0) idx = 0;
      var BON = { S: 1, OH: 2, MB: 0, OPP: 1 }, a0 = [], n0 = [], nm0 = [], a1 = [], n1 = [], nm1 = [];
      Rr.forEach(function (p, j) {
        if (j === idx) { a0.push(stMe); n0.push(c.player.num); nm0.push(c.player.name); return; }
        var st0 = gs(clamp(S + (BON[p] | 0) - (j % 2), 1, 99), p, r); CH.forEach(function (k) { st0[k] = clamp(st0[k] + cb, 1, 99); });
        a0.push(st0); n0.push(freeNum()); nm0.push(nm());
      });
      var used1 = {}; Rr.forEach(function (p, j) { a1.push(gs(clamp(Rv + (D.attr | 0) + Math.round((r() - 0.5) * 4), 1, 99), p, r)); var x = 1 + Math.floor(r() * 20); while (used1[x]) x++; used1[x] = 1; n1.push(x); nm1.push(nm()); });
      cs.pos = role; cs.posName = ((VB.Career.POS6 || {})[role] || {}).name || role; cs.mate = ''; cs.mateNum = 0; cs.meOn = true; cs.status = 'start';
      out = { format: '6v6', venue: 'hall', ctrlRole: role, ctrlIdx: idx, ctrl: 'one', attrs: [a0, a1], nums: [n0, n1], names: [nm0, nm1],
        badges: bd ? [Rr.map(function (x, j) { return j === idx ? bd : null; }), null] : null, meOn: true, meSlot: idx, meBench: -1, points: c.points };
    } else {
      var mr = { atk: 'cr', cr: 'atk', uni: 'uni' }[c.player.roleKey] || 'uni', rm = R(c, 'mate', w.my, cyc);
      var mate = { name: (VB.Career.hall && VB.Career.hall._name ? VB.Career.hall._name(rm) : 'Pareja'), num: 0 };
      mate.num = 1 + Math.floor(rm() * 30); if (mate.num === (c.player.num | 0) || mate.num === 13) mate.num = mate.num % 30 + 2;
      var stMate = gs(clamp(S + (w.st === 'p1' ? 1 : -3), 1, 99), mr, rm); CH.forEach(function (k) { stMate[k] = clamp(stMate[k] + cb, 1, 99); });
      var rA = gs(clamp(Rv + (D.attr | 0) + 1, 1, 99), 'atk', r), rB = gs(clamp(Rv + (D.attr | 0) - 1, 1, 99), 'cr', r);
      cs.mate = mate.name; cs.mateNum = mate.num; cs.role = c.player.roleKey;
      out = { venue: 'beach', ctrl: 'one', ctrlIdx: 0, attrs: [[stMe, stMate], [rA, rB]], badges: bd ? [[bd, null], null] : null, points: E.PTS || 21,
        nums: [[c.player.num | 0, mate.num], null] };
    }
    out.difficulty = ai.diff; out.rookie = ai.soft; out.diffName = ai.name; out.cdiff = E.diffOf(c);
    out.ref = JSON.parse(JSON.stringify((E.REF || {}).top || { p1: 0.2, p2: 0.08, p3: 0.02, d3: 0.1, chal: 2, judges: true }));
    out.kit = kitOpt(w.my); out.rivalKit = kitOpt(rv);
    out.venueMap = venueOf(c, w, f);
    out.career = cs;
    try { var sg = VB.Career.sigOf ? VB.Career.sigOf(c, hl ? 'hall' : 'beach') : null; if (sg) out.serveSig = sg; } catch (e) { }
    return out;
  }
  /** Cierre del partido jugado (main.js careerEvents → X.done). Devuelve el sum del Resumen de la jornada (VB.UI.endCareer) o null. */
  function done(res, g) {
    if (OFF) return null;
    var cs = g && g.career; if (!cs || cs.ext !== 'natl' || !res || !res.sets) return null;
    var c = curC({ mode: cs.mode }); if (!c) return null;
    var n = ensure(c), w = n.win; if (!w || w.id !== cs.natl) return null;
    var f = w.fx[cs.fx | 0]; if (!f || f.res || !isMine(w, f) || stageOf(f.r) !== w.stage) return null;
    var E = K(c), hl = hall(c), sets = [res.sets[0] | 0, res.sets[1] | 0], sc = (res.setScores || []).map(function (x) { return [x[0] | 0, x[1] | 0]; });
    var win = sets[0] > sets[1], auto = !!g.autopilot, Bc = B(), M = Bc && Bc._M ? Bc._M() : null, me = M && M.g === g ? M.p[0] : null;
    var nota = null, rt = null;
    if (!auto) {
      if (me && M.rt && VB.Rating && VB.Rating.close) { try { var cl = VB.Rating.close(M.rt, { sets: sets, setScores: sc }); nota = cl.nota; rt = { nota: cl.nota, best: cl.best, worst: cl.worst }; } catch (e) { nota = null; } }
      if (nota == null) {
        var rallies = (M && M.g === g && M.rallies) || sc.reduce(function (s, x) { return s + x[0] + x[1]; }, 0), pos = cs.pos || 'OH';
        nota = E.rating(me || {}, { win: win, sets: sets }, rallies, hl ? ((VB.Career.hall.RATE6 || {})[pos] || 3) : 1);
      }
    } else {
      var S0 = Sof(c, w.my, cycOf(c, w.s)), rr = R(c, 'auto', w.id, f.i);
      nota = round1(clamp(6.3 + (E.playerOvr(c) - S0) * 0.06 + (win ? 0.5 : -0.3) + (rr() - 0.5) * 1.6, 4, 9.2));
    }
    var st = me || {}, mp = Math.min((st.kills | 0) + (st.aces | 0) + (st.blocks | 0), 10), D = (E.CDIFF || {})[E.diffOf(c)] || { xp: 1 };
    var xp = auto ? 0 : Math.round((40 + 22 * nota + (win ? 40 : 0) + 6 * mp) * NATL_XP[hl ? 'hall' : 'beach'] * (D.xp || 1) * (hl ? 0.8 : 0.6));
    var up = { lvlUp: 0, pts: 0, lvl: c.player.lvl };
    if (xp > 0) { up = E._addXP(c.player, xp); c.player.matches = Math.max(0, (c.player.matches | 0) - 1); }   // (los partidos con la selección van aparte: car.caps)
    var mineA = f.a === w.my;
    f.res = { s: mineA ? sets : [sets[1], sets[0]], sc: sc.map(function (x) { return mineA ? x : [x[1], x[0]]; }),
      me: { on: 1, played: auto ? 0 : 1, nota: nota, xp: xp, k: st.kills | 0, ac: st.aces | 0, bl: st.blocks | 0, dg: st.digs | 0 } };
    var fans = applyMine(c, w, f, { played: auto ? 0 : 1, nota: nota, k: st.kills, a: st.aces, b: st.blocks, d: st.digs, win: win });
    var lbl = cs.label, ei = { name: w.name, art: evInfo(c, w.ev, w.my).art };
    advance(c, w, false);
    if (E.abortMatch) E.abortMatch();
    var nx = pendingMine(w), medal = '';
    if (w.stage === 'done' && w.kind === 'sum') medal = w.pos === 1 ? 'Oro' : w.pos === 2 ? 'Plata' : w.pos === 3 ? 'Bronce' : '';
    var nxt = nx ? 'Siguiente: ' + low1(roundLabel(w, nx)) + ' contra ' + natOf(nx.a === w.my ? nx.b : nx.a).name : '';
    var sum = { kind: 'natl', label: lbl, win: win, nota: nota, xp: xp, lvlUp: up.lvlUp > 0, lvl: up.lvl, ptsGained: up.pts | 0, next: nxt, medal: medal, ev: ei.name, life: { fans: fans } };
    // textos de la hoja final (recap.js los usa si vienen): título sin «el» delante del país, botón y línea de copa del torneo
    sum.title = win ? (medal ? '¡' + medal + '!' : '¡Victoria!') : 'Gana ' + (cs.rivalName || natOf(f.a === w.my ? f.b : f.a).name);
    sum.back = nx ? 'Siguiente: ' + shortRound(nx) : w.stage === 'done' ? 'Volver a la Carrera' : 'Volver al torneo';
    sum.cup = sheetCup(c, w, ei, medal);
    if (rt) sum.rt = rt;
    E.save(c);
    (Array.isArray(VB.CareerExt) ? VB.CareerExt : []).forEach(function (x) { if (x && x.id !== 'natl' && typeof x.hook === 'function') { try { x.hook(c, 'natl', sum); } catch (e) { } } });
    return sum;
  }
  /** Ronda corta para el botón de la hoja final («3ª jornada», «semifinal», «2º partido»). */
  function shortRound(f) {
    if (/^g[123]$/.test(f.r)) return ordF(+f.r.charAt(1)) + ' jornada';
    return { qf: 'cuartos', sf: 'semifinal', f: 'final', b: 'bronce', q1: '1r partido', q2: '2º partido' }[f.r] || 'partido';
  }
  /** Línea de copa de la hoja final: medalla, puesto final o billete de la clasificación ('' a mitad de torneo). */
  function sheetCup(c, w, ei, medal) {
    if (w.stage !== 'done') return '';
    if (w.kind === 'q') return w.qOk ? '¡Billete para ' + theEv(evInfo(c, w.ev, w.my)) + '!' : 'Sin billete: pasa ' + natOf(w.qW).name;
    if (medal === 'Oro') return '¡Oro ' + enEv(ei) + '!';
    if (medal) return medal + ' ' + enEv(ei);
    return w.pos ? natOf(w.my).name + ' termina ' + ordF(w.pos) : '';
  }
  function quit() { return null; }   // (a medias: el partido sigue pendiente, como una jornada de liga)

  // ------------------------------------------------------------------ acciones (guardan)
  function cur() { var C = VB.Career; var c = C && C.get ? C.get() : null; if (c) ensure(c); return c; }
  /** Simula tu partido pendiente (contigo si juegas). */
  function simFx(c) {
    c = c || cur(); if (!c) return false;
    var w = ensure(c).win, f = pendingMine(w); if (!f) return false;
    var on = plays(c, w, f);
    f.res = simRes(c, w, f, on);
    if (on) applyMine(c, w, f, { played: 0, nota: f.res.me.nota, k: f.res.me.k, a: f.res.me.ac, b: f.res.me.bl, d: f.res.me.dg, win: winner(f) === w.my });
    advance(c, w, false);
    K(c).save(c); return true;
  }
  function simAll(c) {
    c = c || cur(); if (!c) return false;
    var w = ensure(c).win; if (!w || w.stage === 'done') return false;
    advance(c, w, true); K(c).save(c); return true;
  }
  /** «Pedir descanso este verano» (solo la convocatoria de verano, antes de jugar nada). */
  function decline(c) {
    c = c || cur(); if (!c) return false;
    var n = ensure(c), w = n.win; if (!w || w.kind !== 'sum' || !w.on || w.dec || w.mt.n > 0 || w.stage === 'done') return false;
    w.dec = 1; n.trust = clamp(n.trust - 15, 0, 100);
    advance(c, w, true); K(c).save(c); return true;
  }
  /** Playa: cambiar de país hasta la 1ª convocatoria (dir ±1). */
  function setCountry(c, dir) {
    c = c || cur(); if (!c || hall(c)) return false;
    var n = ensure(c); if (n.lock || (n.win && n.win.stage !== 'done')) return false;
    var l = CODES.slice().sort(function (a, b) { return natOf(a).name.localeCompare(natOf(b).name, 'es'); }), i = l.indexOf(n.cc);
    n.cc = l[(i + (dir < 0 ? -1 : 1) + l.length) % l.length];
    K(c).save(c); return true;
  }

  // ------------------------------------------------------------------ legado, vitrina, Salón de la Fama
  function legacyOf(c, t) {
    if (!t || (t.kind !== 'sel' && t.kind !== 'selm' && t.kind !== 'selp')) return null;
    var E = EV[t.ev] || EV.vbn;
    if (t.kind === 'sel') return E.leg;
    if (t.kind === 'selm') return Math.round(E.leg * ((t.med | 0) === 2 ? 0.6 : 0.4));
    return /^MVP/.test(String(t.name || '')) ? 10 : 5;
  }
  function legacyExtra(c) { var n = c && c.natl; return n && n.car ? Math.floor((n.car.caps | 0) / 5) : 0; }
  function caseSlots(c) {
    if (!c) return [];
    var cc = ensure(c).cc;
    return CYC.map(function (ev) { return { id: 'nt-' + ev, group: 'Selección', kind: 'sel', name: evName(c, ev, cc), need: 'Gana el oro' }; });
  }
  function capsOf(c) { return c && c.natl && c.natl.car ? c.natl.car.caps | 0 : 0; }

  // ------------------------------------------------------------------ «Carrera con vida» (opcional)
  function SY() { var S = VB.CareerStory; return S && S.post && S.use ? S : null; }
  function storyCall(c, w, ei) {
    var S = SY(); if (!S) return;
    try {
      if (S.pushWall) S.pushWall(c, { a: S.cast ? S.cast(c).media.digital : '', t: '¡' + c.player.name + ' convocado con ' + natOf(w.my).name + ' para ' + theEv(ei) + '!', v: { k: 'nt' } });
      S.post(c, { k: 'press', b: 'nt-press', o: 1, vars: { pais: natOf(w.my).name, torneo: w.name } });
    } catch (e) { }
  }
  function storyMedal(c, w, m) {
    var S = SY(); if (!S || !S.pushWall) return;
    try { S.pushWall(c, { a: S.cast ? S.cast(c).media.diario : '', t: '¡' + m + ' para ' + natOf(w.my).name + ' en ' + w.name + '!', v: { k: 'nt' } }); } catch (e) { }
  }
  var STORY_SYS = {
    id: 'natl',
    tpl: { 'nt-press': { k: 'press', t: ['¿Qué significa la convocatoria?', 'La prensa pregunta por la selección', 'Micrófonos tras la lista'],
      x: ['Te preguntan por la llamada de {pais} para {torneo}.', 'Rueda de prensa: todos quieren saber qué supone {torneo} para ti.'],
      o: [{ t: 'Es un sueño', e: { mood: 1 } }, { t: 'Vengo a ganar', e: { fame: 0.01, fameMin: 50 } }, { t: 'Solo pienso en el club', e: { coach: 2 } }] } },
    chips: function (c) {
      if (OFF || !c || !c.natl) return [];
      var w = c.natl.win, f = w && Array.isArray(w.fx) && w.mt ? pendingMine(w) : null;   // (puro: sin ensure ni reparaciones)
      return f ? [{ p: 2, ic: '⚑', t: 'Selección: partido pendiente', x: w.name, tab: 'club', s: 'natl' }] : [];
    }
  };

  // ------------------------------------------------------------------ interfaz (VB.CareerUIExt)
  function H_(HLP) {
    return HLP || { esc: esc, sp: function (a) { return a.filter(function (x) { return x !== '' && x != null; }).join(' | '); }, kitSw: function () { return ''; }, q: function () { return ''; }, ph: function () { return false; } };
  }
  function tagOf(st) {
    var t = stText(st);
    return st === 'tit' || st === 'p1' || st === 'conv' || st === 'p2' ? '<span class="tag y">' + t + '</span>' : st === 'pre' ? '<span class="tag">' + t + '</span>' : st === 'inj' ? '<span class="tag r">' + t + '</span>' : '<span class="muted">' + t + '</span>';
  }
  function scoreTxt(w, f) {
    if (!f.res) return 'Pendiente';
    var mineA = f.a === w.my, s = f.res.s, t = mineA ? s[0] + '-' + s[1] : s[1] + '-' + s[0];
    return isMine(w, f) && f.res.me && !f.res.me.on ? t + ' (no juegas)' : t;
  }
  function fxLine(w, f, hl) {
    var a = natOf(f.a), b = natOf(f.b), s = f.res ? ' ' + f.res.s[0] + '-' + f.res.s[1] + ' ' : ' contra ';
    var t = esc(hl ? a.ab : a.name) + s + esc(hl ? b.ab : b.name);
    return isMine(w, f) ? '<b>' + t + '</b>' : t;
  }
  function stageName(w) {
    if (w.stage === 'done') return 'Terminado';
    if (/^g/.test(w.stage)) return 'Fase de grupos';
    return { qf: 'Cuartos', sf: 'Semifinales', f: 'Finales', q1: 'Clasificación', q2: 'Clasificación' }[w.stage] || '';
  }
  /** Club › Selección. */
  function page(c, sub, HLP) {
    if (OFF || !c) return '';
    var Hh = H_(HLP), n = ensure(c), nat = natOf(n.cc), w = n.win, hl = hall(c), ph = !!(Hh.ph && Hh.ph());
    if (w && w.id > n.seen) { n.seen = w.id; try { K(c).save(c); } catch (e) { } }
    var cyc = cycOf(c, c.season), stt = status(c), h = '';
    // 1. parche: país, equipación y estado
    h += '<div class="card"><h3>' + Hh.kitSw(nat.kit, true) + ' ' + esc(nat.name) + ' ' + tagOf(n.st) + '</h3>' +
      '<p class="muted">' + Hh.sp(['Seleccionador: ' + esc(coachName(c, n.cc, cyc)), 'Confianza ' + Math.round(n.trust), esc(chemTxt(n))], 'v') + '</p></div>';
    // 2. el torneo en curso va arriba (es lo que se puede jugar); cerrado, más abajo
    var live = !!(w && w.stage !== 'done');
    if (live) h += tourCard(c, w, Hh, ph);
    // 3. cómo entrar
    var lo = stt.cut.pre - 4, hi = stt.cut.tit + 2, pct = Math.round(clamp((stt.score - lo) / (hi - lo), 0, 1) * 100);
    var ttl = stt.st === 'tit' || stt.st === 'p1' ? 'En lo más alto' : called(stt.st) ? (hl ? 'Cómo ser titular' : 'Cómo ser Pareja 1') : 'Cómo entrar';
    var expl = 'El seleccionador mira tu media, tu nota media de la temporada, tu fama, el nivel de tu liga y su confianza en ti. Ser joven suma un poco. Cada país pide más o menos según su fuerza.';
    h += '<div class="card"><h3>' + esc(ttl) + ' ' + Hh.q(ttl, expl) + '</h3>' +
      '<p>' + esc('Tu nota para el seleccionador: ' + dec(stt.score) + '. Lista: ' + Math.round(stt.cut.conv) + '. ' + (hl ? 'Titular' : 'Pareja 1') + ': ' + Math.round(stt.cut.tit) + '.') + '</p>' +
      '<div class="pbar"><span>Tú</span><span class="bar"><i style="width:' + pct + '%"></i></span><b>' + Math.round(stt.score) + '</b></div>' +
      (stt.gap > 0 ? '<p>' + esc('Te faltan ' + dec(stt.gap) + ' puntos para ' + (called(stt.st) ? (hl ? 'ser titular' : 'ser Pareja 1') : 'la lista') + '.') + '</p>' : '') +
      '<p class="muted">' + esc(stt.tip + ' Cuenta para la próxima convocatoria.') + '</p></div>';
    // 3b. playa: país
    if (!hl && !n.lock) {
      var busy = !!(w && w.stage !== 'done');
      h += '<div class="card"><h3>Tu país</h3><p>País: <b>' + esc(nat.name) + '</b></p>' +
        '<div class="acts"><button data-act="nt-cc-prev"' + (busy ? ' disabled' : '') + ' aria-label="País anterior">‹ Anterior</button><button data-act="nt-cc-next"' + (busy ? ' disabled' : '') + ' aria-label="País siguiente">Siguiente ›</button></div>' +
        '<p class="muted">Se fija con tu primera convocatoria.</p></div>';
    }
    // 4. torneo cerrado
    if (w && !live) h += tourCard(c, w, Hh, ph);
    // 5. próximos veranos
    var rows = [];
    for (var s = c.season + (c.phase === 'off' ? 1 : 0), j = 0; j < 4; j++, s++) {
      var ev = evOf(c, s), ei = evInfo(c, ev, n.cc), F = j === 0 ? fieldOf(c, s) : null;
      rows.push('<tr><td class="l">T' + s + '</td><td class="club">' + esc(ei.name) + '</td><td class="hide-s">' + (F ? esc(natOf(F.host).name) : '—') + '</td></tr>');
    }
    h += '<div class="card"><h3>Próximos veranos</h3><table><thead><tr><th class="l">Tras</th><th class="l">Torneo</th><th class="hide-s">Sede</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    // 6. historial
    var car = n.car, md = [];
    if (n.med.g) md.push(plural(n.med.g, 'oro', 'oros')); if (n.med.s) md.push(plural(n.med.s, 'plata', 'platas')); if (n.med.b) md.push(plural(n.med.b, 'bronce', 'bronces'));
    h += '<div class="card"><h3>Tu historia con ' + esc(nat.name) + '</h3>' +
      (car.caps ? '<p>' + Hh.sp([plural(car.caps, 'partido', 'partidos'), plural(car.w, 'victoria', 'victorias'), car.nN ? 'Nota media ' + dec(car.nS / car.nN) : '', md.join(', ')], 'v') + '</p>' : '<p class="muted">Aún no has jugado con la selección.</p>') +
      (car.debut ? '<p class="muted">Debut: T' + car.debut + '</p>' : '');
    var hs = n.hist.slice(-8).reverse();
    if (hs.length) h += '<table><thead><tr><th class="l">T</th><th class="l">Torneo</th><th>Resultado</th><th class="hide-s">Tu papel</th></tr></thead><tbody>' + hs.map(function (x) {
      return '<tr><td class="l">' + (x.s | 0) + '</td><td class="club">' + esc(x.name) + '</td><td>' + esc(x.res) + '</td><td class="hide-s">' + esc(x.st) + (x.caps ? ' (' + x.caps + ')' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
    h += '</div>';
    return h;
  }
  /** Tarjeta del torneo de la ventana (Club › Selección). */
  function tourCard(c, w, Hh, ph) {
    var hl = hall(c), nat = natOf(w.my), h = '<div class="card"><h3>' + esc(w.kind === 'q' ? 'Clasificación' : w.name) + '</h3>';
    var meta = w.kind === 'q' ? ['Para ' + esc(evInfo(c, w.ev, w.my).art + ' ' + w.name), 'Antes de la jornada ' + w.exp] : [w.host ? 'En ' + esc(natOf(w.host).name) : '', 'Tras la T' + w.s, esc(stageName(w)), esc(roleOf(w))];
    h += '<p class="muted">' + Hh.sp(meta, 'v') + '</p>';
    if (w.nq) h += '<p>' + esc(nat.name + ' no se ha clasificado.') + '</p>';
    // tu próximo partido y los botones, arriba (en el móvil se ven sin desplazar)
    var pf = pendingMine(w);
    if (pf) h += '<p>' + Hh.sp([esc(roundLabel(w, pf)), '<b>' + esc((ph ? nat.ab : nat.name) + ' contra ' + (ph ? natOf(pf.a === w.my ? pf.b : pf.a).ab : natOf(pf.a === w.my ? pf.b : pf.a).name)) + '</b>', plays(c, w, pf) ? '' : 'No juegas'], 'v') + '</p>';
    h += actsHTML(c, w, true);
    if (w.kind === 'sum' && !w.nq) {
      var gi = 0; w.groups.forEach(function (g, i) { if (g.indexOf(w.my) >= 0) gi = i; });
      var t = groupTable(c, w, gi);
      h += '<table><thead><tr><th class="l">Grupo ' + 'ABCD'.charAt(gi) + '</th><th>PJ</th><th class="hide-s">G</th><th class="hide-s">P</th><th>Sets</th><th>Pts</th></tr></thead><tbody>' + t.map(function (r) {
        return '<tr' + (r.cc === w.my ? ' class="me"' : '') + '><td class="club">' + esc(ph ? natOf(r.cc).ab : natOf(r.cc).name) + '</td><td>' + r.pj + '</td><td class="hide-s">' + r.g + '</td><td class="hide-s">' + r.p + '</td><td>' + r.sf + '-' + r.sc + '</td><td class="pts">' + r.pts + '</td></tr>';
      }).join('') + '</tbody></table>';
      var ko = w.fx.filter(function (f) { return !/^g/.test(f.r); });
      if (ko.length) h += '<p>' + ko.map(function (f) { return esc(RND_TXT[f.r]) + ': ' + fxLine(w, f, ph); }).join('<br>') + '</p>';
    }
    if (w.kind === 'q') h += '<p>' + w.fx.map(function (f) { return esc(RND_TXT[f.r] || '') + ': ' + fxLine(w, f, ph); }).join('<br>') + '</p>';
    var mine = w.fx.filter(function (f) { return isMine(w, f); });
    if (w.on && mine.length) h += '<p class="muted">' + mine.map(function (f) { return esc(roundLabel(w, f) + ': ' + scoreTxt(w, f)); }).join('<br>') + '</p>';
    if (w.stage === 'done' && w.kind === 'sum' && w.pos) h += '<p><b>' + esc(nat.name + ' termina ' + ordF(w.pos) + '.') + '</b> ' + esc('Oro para ' + natOf(w.champ).name + '.') + '</p>';
    return h + '</div>';
  }
  function actsHTML(c, w, full) {
    var f = pendingMine(w); if (!f && !(full && w.stage !== 'done')) return '';
    var b = [];
    if (f && plays(c, w, f)) b.push('<button class="pri" data-act="nt-play" aria-label="Jugar con la selección">Jugar</button>', '<button data-act="nt-sim">Simular partido</button>');
    else if (f) b.push('<button class="pri" data-act="nt-sim">Simular</button>');
    if (full && w.stage !== 'done' && w.on && !w.dec) b.push('<button data-act="nt-simall">Simular el resto</button>');
    if (full && w.kind === 'sum' && w.on && !w.dec && !w.mt.n && w.stage !== 'done') b.push('<button data-act="nt-dec">Pedir descanso este verano</button>');
    return b.length ? '<div class="acts">' + b.join('') + '</div>' : '';
  }
  /** Tarjeta en Partido (hueco 'match'): el siguiente partido de la selección o el resultado del verano. */
  function card(c, HLP) {
    if (OFF || !c || c.myClub < 0) return '';
    var Hh = H_(HLP), n = ensure(c), w = n.win; if (!w) return '';
    var nat = natOf(w.my), hl = hall(c), ph = !!(Hh.ph && Hh.ph());
    if (w.stage === 'done') {
      if (w.kind !== 'sum' || !w.on || c.phase !== 'off' || !w.pos) return '';
      return '<div class="card"><h3>' + esc('Selección: ' + w.name) + ' ' + (w.pos <= 3 ? '<span class="tag y">' + esc(resText(w.pos, w)) + '</span>' : '') + '</h3><p>' + esc(nat.name + ' termina ' + ordF(w.pos) + '. Oro para ' + natOf(w.champ).name + '.') + '</p>' +
        '<div class="acts"><button data-act="nt-go">Ver torneo</button></div></div>';
    }
    var f = pendingMine(w); if (!f) return '';
    var rv = f.a === w.my ? f.b : f.a, cyc = cycOf(c, w.s), on = plays(c, w, f), pr = pressOf(f), nerv = n.car.caps < 3 || (f.r === 'f' && !n.fin);
    var h = '<div class="card new"><h3>' + esc('Selección: ' + (w.kind === 'q' ? 'clasificación' : w.name)) + '</h3>';
    h += '<p>' + Hh.sp([esc(roundLabel(w, f)), '<b>' + esc(ph ? nat.ab + ' contra ' + natOf(rv).ab : nat.name + ' contra ' + natOf(rv).name) + '</b>'], 'v') + '</p>';
    h += '<p class="muted">' + Hh.sp(['Fuerza ' + Math.round(Sof(c, w.my, cyc)) + ' contra ' + Math.round(Sof(c, rv, cyc)), w.host ? 'En ' + esc(natOf(w.host).name) : ''], 'v') + '</p>';
    if (on && pr >= 2 && nerv) h += '<p>' + esc(pr >= 3 ? (f.r === 'f' ? 'Presión alta: tu primera final.' : 'Presión alta: partido grande y poca experiencia.') : 'Presión: aún te pesan los nervios.') + '</p>';
    else if (on && n.car.caps < 3) h += '<p>' + esc(n.car.caps ? 'Aún te pesan los nervios.' : 'Tu debut: los nervios te restan un poco.') + '</p>';
    if (!on) h += '<p>El seleccionador no te pone en este partido.</p>';
    if (w.kind === 'q') h += '<p class="muted">' + esc('Si no lo juegas antes de la jornada ' + w.exp + ' del club, se simula.') + '</p>';
    else if (c.phase === 'off') h += '<p class="muted">Si firmas antes de acabar, el resto del torneo se simula.</p>';
    // (sin parche: en Partido la acción principal es la jornada del club; el parche «Jugar» está en Club › Selección)
    var b = on ? '<button data-act="nt-play" aria-label="Jugar con la selección">Jugar</button><button data-act="nt-sim">Simular</button>' : '<button data-act="nt-sim">Simular</button>';
    return h + '<div class="acts">' + b + '<button data-act="nt-go">Ver torneo</button></div></div>';
  }
  /** Palmarés: totales con la selección (si ya has jugado). */
  function honors(c, HLP) {
    if (OFF || !c || !c.natl || !c.natl.car || !(c.natl.car.caps > 0)) return '';
    var Hh = H_(HLP), n = c.natl, md = [];
    if (n.med.g) md.push(plural(n.med.g, 'oro', 'oros')); if (n.med.s) md.push(plural(n.med.s, 'plata', 'platas')); if (n.med.b) md.push(plural(n.med.b, 'bronce', 'bronces'));
    return '<div class="card"><h3>Selección</h3><p>' + Hh.sp([esc(natOf(n.cc).name), plural(n.car.caps, 'partido', 'partidos'), md.join(', ')], 'v') + '</p><div class="acts"><button data-act="nt-go">Ver selección</button></div></div>';
  }
  function dot(c, where) {
    if (OFF || !c || c.myClub < 0 || !c.natl) return false;
    var w = c.natl.win;
    if (where === 'club' || where === 'natl') return !!(w && w.on && (w.id | 0) > (c.natl.seen | 0));
    return false;
  }
  function act(a) {
    var c = cur(); if (!c) return null;
    var n = c.natl, w = n.win;
    if (a === 'nt-go') return { tab: 'club', s: 'natl' };
    if (a === 'nt-play') { var f = pendingMine(w); if (!f || !plays(c, w, f)) return false; return { play: { id: 'natl', arg: { w: w.id, i: f.i, mode: hall(c) ? 'hall' : 'beach' } } }; }
    if (a === 'nt-sim') return simFx(c) ? { render: true } : false;
    if (a === 'nt-simall') return simAll(c) ? { render: true } : false;
    if (a === 'nt-dec') return decline(c) ? { render: true } : false;
    if (a === 'nt-cc-prev' || a === 'nt-cc-next') return setCountry(c, a === 'nt-cc-prev' ? -1 : 1) ? { render: true } : false;
    return null;
  }

  // ------------------------------------------------------------------ estados de muestra (pruebas y mobaudit)
  /** Deja la carrera c en un estado de muestra y guarda: 'sum' (verano en marcha, convocado, 1r partido jugado), 'q' (ventana de
   *  clasificación de la pista; en la playa, como 'sum'), 'off' (temporada acabada y verano en marcha) o 'done' (torneo cerrado). */
  function debugSeed(c, k) {
    if (!c || c.myClub < 0) return false;
    var n = ensure(c), E = K(c);
    if (k === 'off') {
      var g = 0; while (c.phase !== 'off' && g++ < 80) { var nx = E.next(c); if (nx && nx.bench) E.benchNext(c); else if (!E.simulateNext(c)) break; c = curC({ mode: hall(c) ? 'hall' : 'beach' }) || c; }
      n = ensure(c); k = 'sum';
    }
    n.trust = Math.max(n.trust, 62); n.chem = Math.max(n.chem, 40);
    if (!n.car.caps) { n.car.caps = 7; n.car.starts = 7; n.car.w = 4; n.car.l = 3; n.car.nS = 46.2; n.car.nN = 7; n.car.debut = Math.max(1, (c.season | 0) - 1); n.med.b = 1;
      n.hist.push({ s: Math.max(1, (c.season | 0) - 1), ev: 'vbn', name: evName(c, 'vbn', n.cc), res: 'Bronce', pos: 3, st: hall(c) ? 'Convocado' : 'Pareja 2', caps: 5, nota: 6.8 }); }
    var s = c.season | 0;
    if (k === 'q' && hall(c)) {
      var F = fieldOf(c, s), keep = n.cc, ev = F.ev, guard = 0;
      while (!F.rep && guard++ < 4) { s++; F = fieldOf(c, s); ev = F.ev; }
      if (!F.rep) return false;
      var rep = F.rep.indexOf(keep) >= 0 ? F.rep : [keep].concat(F.rep.filter(function (x) { return x !== keep; }).slice(0, 2));
      var cyc = cycOf(c, s), ei = evInfo(c, ev, keep), oth = rep.filter(function (x) { return x !== keep; });
      var w = { id: ++n.n, kind: 'q', ev: ev, s: c.season | 0, name: ei.name, host: '', T: 3, my: keep, st: 'tit', sur: 0, on: 1, dec: 0, teams: rep.slice(), groups: [], rep: null,
        fx: [], stage: 'q1', out: 0, nq: 0, wk: c.week | 0, exp: (c.week | 0) + 1, mt: { n: 0, sum: 0 } };
      addFx(w, 'q1', keep, oth[0]); addFx(w, 'q2', keep, oth[1]); addFx(w, 'q2', oth[0], oth[1]);
      n.win = w; n.st = 'tit'; n.qS = c.season | 0; cycleCheck(c, cyc);
      E.save(c); return true;
    }
    // verano: el torneo grande del ciclo, con tu país dentro y convocado
    var F2 = fieldOf(c, s), cy2 = F2.cyc;
    var teams = F2.direct.slice(); if (F2.rep) teams.push(F2.rep[0]);
    if (teams.indexOf(n.cc) < 0) teams[teams.length - 1] = n.cc;
    var ei2 = evInfo(c, F2.ev, n.cc), st = hall(c) ? 'tit' : 'p1';
    var w2 = { id: ++n.n, kind: 'sum', ev: F2.ev, s: s, name: ei2.name, host: F2.host, T: F2.T, my: n.cc, st: st, sur: 0, on: 1, dec: 0, teams: teams, groups: groupsOf(c, teams, F2.host, cy2),
      rep: F2.rep, repW: F2.rep ? F2.rep[0] : null, fx: [], stage: 'g1', out: 0, nq: 0, mt: { n: 0, sum: 0 } };
    w2.groups.forEach(function (gg) { GPAIRS.forEach(function (rd, j) { rd.forEach(function (p) { addFx(w2, 'g' + (j + 1), gg[p[0]], gg[p[1]]); }); }); });
    n.win = w2; n.st = st; n.stS = s; if (!hall(c)) n.lock = 1; cycleCheck(c, cy2);
    var f1 = pendingMine(w2);
    if (f1) { f1.res = simRes(c, w2, f1, true); applyMine(c, w2, f1, { played: 0, nota: f1.res.me.nota, k: f1.res.me.k, a: f1.res.me.ac, b: f1.res.me.bl, d: f1.res.me.dg, win: winner(f1) === w2.my }); advance(c, w2, false); }
    if (k === 'done') advance(c, w2, true);
    E.save(c); return true;
  }

  // ------------------------------------------------------------------ registro
  var API = {
    id: 'natl', hook: hook, ensure: ensure, status: status, scoreOf: scoreOf, window: function (c) { c = c || cur(); return c ? ensure(c).win : null; },
    nextFx: function (c) {
      c = c || cur(); if (!c) return null; var w = ensure(c).win, f = pendingMine(w); if (!f) return null;
      var rv = f.a === w.my ? f.b : f.a; return { fx: f, label: roundLabel(w, f), rival: rv, mine: plays(c, w, f), press: pressOf(f) };
    },
    setup: setup, done: done, quit: quit, simFx: simFx, simAll: simAll, decline: decline, setCountry: setCountry,
    legacyOf: legacyOf, legacyExtra: legacyExtra, caseSlots: caseSlots, capsOf: capsOf,
    html: page, page: page, card: card, honors: honors, dot: dot, act: act,
    NAT: NAT, EV: EV, CYC: CYC, CUT: CUT, FAME_EV: FAME_EV, NATL_XP: NATL_XP,
    evOf: evOf, cycOf: cycOf, evName: evName, str: str, strB: strB, Sof: Sof, natOf: natOf, fieldOf: fieldOf, groupTable: groupTable, placesOf: placesOf,
    plays: plays, pendingMine: pendingMine, coachName: coachName, stText: stText, winOk: winOk,
    _debugSeed: debugSeed, _demo: debugSeed, _K: K, _openSum: openSum, _openQ: openQ, _advance: advance, _simRes: simRes,
    get OFF() { return OFF; }, set OFF(v) { OFF = !!v; }
  };
  VB.CareerNatl = API;
  (VB.CareerExt = VB.CareerExt || []).push(API);
  (VB.CareerUIExt = VB.CareerUIExt || []).push({
    id: 'natl', prefix: 'nt-', subs: [{ tab: 'club', id: 'natl', label: 'Selección', labelPh: 'Selección', has: function (c) { return !OFF && !!c && c.myClub >= 0; } }],
    page: page, match: card, honors: honors, dot: dot, act: act
  });
  if (VB.CareerStory && typeof VB.CareerStory.use === 'function') { try { VB.CareerStory.use(STORY_SYS); } catch (e) { } }
})(typeof window !== 'undefined' ? window : globalThis);
