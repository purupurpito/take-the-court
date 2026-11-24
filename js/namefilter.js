/* TAKE THE COURT — js/namefilter.js (owner: net)
 * Nombres que ven otros jugadores (Google Play, 24-nov-2026): nombre anónimo por defecto y un filtro básico de insultos.
 *
 *  - Nombre por defecto: «Jugador NNNN», el mismo siempre en este aparato (NNNN de 1000 a 9999, guardado en 'make-the-cut.anon',
 *    del aparato: nunca va a la cuenta). Antes salía el nombre del personaje de la Carrera o el usuario de la cuenta: ya no. Solo
 *    sale otro nombre si el jugador lo escribe a mano en «Tu nombre en el online» ('make-the-cut.nick').
 *  - Filtro: bad(nombre) → true si lleva un insulto o una palabra ofensiva de una lista corta (español, catalán e inglés). Se usa
 *      a) al elegir tu nombre (el lobby lo rechaza: «Ese nombre no vale: elige otro.») y para no usar un apodo guardado de antes;
 *      b) al ENSEÑAR nombres que llegan de otros (salas, saludo, «pre», récord online, enlace de la semana): shown() lo cambia por
 *         «Jugador NNNN» (número sacado del uid o del propio nombre), así un cliente modificado no puede enseñar un insulto.
 *    Normaliza: minúsculas, sin tildes (la ñ se queda), l·l, números como letras (0→o 1→i/l 3→e 4→a 5→s 7→t, @→a, $→s),
 *    letras repetidas («puuuta»), separadores («p.u.t.a», «p u t a», «pu-ta») y palabras pegadas en mayúsculas («ElPutoAmo»).
 *    Las palabras que también son normales o nombres van por palabra entera (TOK); solo las inequívocas se buscan dentro de otras
 *    (SUB). tools/nametest.js prueba los insultos y más de 300 nombres y palabras corrientes que NO deben saltar.
 *    Es un filtro básico: no entiende contexto ni alfabetos parecidos (cirílico); el servidor no lo comprueba (no hay servidor).
 *
 * API (VB.NameFilter): bad(s) · mask(s, seed) → 'Jugador NNNN' · shown(s, seed) → s o mask · anonNum() · anonName() ·
 *   nick() → el apodo guardado si vale (2-16, sin @ ni insultos), si no '' · NICK, ANON (claves) · MSG (texto del rechazo).
 * Puro: sin DOM ni THREE; localStorage siempre en try/catch. Nunca toca g.rng (Math.random solo para el número anónimo).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var NICK = 'make-the-cut.nick', ANON = 'make-the-cut.anon';
  var MSG = 'Ese nombre no vale: elige otro.';

  // Inequívocas: se buscan también DENTRO de otras palabras y con todo pegado («eresunhijoputa»).
  var SUB = [
    'hijoputa', 'hijaputa', 'hijodeputa', 'hijadeputa', 'hijueputa', 'fillputa', 'filldeputa', 'fielldeputa',
    'malparit', 'malparid', 'gilipoll', 'gilipola', 'chupapoll', 'chupapola', 'comepoll', 'soplapoll', 'mamaverg', 'mamagueb',
    'cabron', 'maricon', 'mierda', 'subnormal', 'imbecil', 'idiota', 'estupid', 'stupid', 'pederast', 'pedofil', 'violador',
    'puticlub', 'negrata', 'sudaca', 'furcia', 'ramera', 'pajiller', 'follamadre', 'cojon', 'collons', 'mecagoen', 'mecagüen',
    'motherfuck', 'fuck', 'nigger', 'nigga', 'faggot', 'asshole', 'bitch', 'whore', 'bullshit', 'shithead', 'rapist', 'hitler',
    'putamadre', 'putamare', 'lagranputa'
  ];
  // Por palabra entera (con plural -s/-es): también son nombres, apellidos o palabras normales dentro de otras
  // («disputa», «computadora», «Pola», «Zorrilla», «Mazorra», «retardo», «Yoshitaka», «Scunthorpe»…).
  var TOK = [
    'puta', 'puto', 'putita', 'putito', 'putilla', 'putillo', 'puton', 'putona', 'putero', 'putera', 'zorra', 'zorron', 'guarra',
    'polla', 'coño', 'conyo', 'marica', 'marico', 'bollera', 'travelo', 'bujarra', 'mongolo', 'mongola', 'retrasado', 'retrasada',
    'capullo', 'capoll', 'merda', 'follar', 'follando', 'follador', 'nazi', 'kkk', 'hdp', 'hdlgp', 'hpta', 'ptm', 'ctm', 'csm',
    'lpm', 'fdp', 'stfu', 'kys', 'cunt', 'shit', 'shitty', 'slut', 'fag', 'cock', 'pussy', 'porn', 'porno', 'retard', 'retarded',
    'wanker', 'twat', 'bastard', 'dickhead', 'gilipolles', 'cabrona'
  ];

  /** Texto → patrón que acepta cada letra repetida («puta» → p+u+t+a+) y n o ñ donde va n (no al revés: «cono» no es «coño»). */
  function pat(w) {
    var s = '';
    for (var i = 0; i < w.length; i++) {
      var c = w.charAt(i);
      s += (c === 'n' ? '[nñ]' : c === 'ü' ? 'u' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + '+';
    }
    return s;
  }
  function plain(w) { return w.replace(/ü/g, 'u'); }
  var RE_SUB = new RegExp('(?:' + SUB.map(function (w) { return pat(plain(w)); }).join('|') + ')');
  var RE_SUB0 = new RegExp('^(?:' + SUB.map(function (w) { return pat(plain(w)); }).join('|') + ')');
  var RE_TOK = new RegExp('^(?:' + TOK.map(function (w) { return pat(plain(w)); }).join('|') + ')(?:e?s+)?$');

  /** Minúsculas, sin tildes (ñ sí), l·l junta, mayúscula tras minúscula = palabra nueva. */
  function norm(s) {
    s = String(s == null ? '' : s).replace(/([a-záéíóúàèòïüñç])([A-ZÁÉÍÓÚÀÈÒÏÜÑÇ])/g, '$1 $2');
    s = s.toLowerCase();
    try { s = s.normalize('NFD').replace(/ñ/g, 'ñ').replace(/[̀-ͯ]/g, ''); } catch (e) { }
    return s.replace(/[·•]/g, '');
  }
  function leet(s, one) {
    return s.replace(/[0134578@$€!|]/g, function (c) {
      return { '0': 'o', '1': one, '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '€': 'e', '!': 'i', '|': 'i' }[c];
    });
  }
  /** Palabras sueltas (y sin xx delante o detrás), letras sueltas seguidas juntas («p u t a») parejas de palabras («pu ta») y tríos (solo si empiezan por una inequívoca). */
  function candidates(s) {
    var toks = s.split(/[^a-zñ]+/).filter(Boolean), one = [], pairs = [], starts = [], run = '';
    for (var i = 0; i <= toks.length; i++) {
      var t = toks[i];
      if (t && t.length === 1) { run += t; continue; }
      if (run.length >= 2) one.push(run);
      run = '';
    }
    for (var k = 0; k < toks.length; k++) { one.push(toks[k]); var x = toks[k].replace(/^x{2,}|x{2,}$/g, ''); if (x && x !== toks[k]) one.push(x); }
    for (var j = 0; j + 1 < toks.length; j++) pairs.push(toks[j] + toks[j + 1]);
    for (var m = 0; m + 2 < toks.length; m++) starts.push(toks[m] + toks[m + 1] + toks[m + 2]);   // («me cago en»)
    return { one: one, pairs: pairs, starts: starts };
  }
  /** ¿Lleva un insulto? Las inequívocas (SUB) dentro de cada palabra; en una pareja de palabras, solo si la pareja EMPIEZA por una
   *  («gili pollas»), porque dentro de dos nombres juntos aparecen por azar («Paco Jones» → «pacojones»). */
  function bad(name) {
    var n = norm(name);
    if (!n) return false;
    var vs = [leet(n, 'i'), leet(n, 'l')];
    for (var v = 0; v < vs.length; v++) {
      var c = candidates(vs[v]), i;
      for (i = 0; i < c.one.length; i++) if (RE_TOK.test(c.one[i]) || RE_SUB.test(c.one[i])) return true;
      for (i = 0; i < c.pairs.length; i++) if (RE_TOK.test(c.pairs[i]) || RE_SUB0.test(c.pairs[i])) return true;
      for (i = 0; i < c.starts.length; i++) if (RE_SUB0.test(c.starts[i])) return true;
    }
    return false;
  }
  function hash(s) { s = String(s == null ? '' : s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  /** «Jugador NNNN» para un nombre que no se puede enseñar (seed: el uid si se sabe; si no, el propio nombre). */
  function mask(name, seed) { return 'Jugador ' + (1000 + hash(seed || name || 'x') % 9000); }
  /** El nombre tal cual, o «Jugador NNNN» si lleva un insulto. */
  function shown(name, seed) { return name && bad(name) ? mask(name, seed) : name; }

  function LS() { try { return root.localStorage || null; } catch (e) { return null; } }
  var memAnon = 0;
  /** Número del nombre anónimo de este aparato (1000-9999), creado la primera vez. */
  function anonNum() {
    var l = LS(), v = 0;
    try { v = l ? +(l.getItem(ANON) || 0) : 0; } catch (e) { v = 0; }
    if (v >= 1000 && v <= 9999 && v === Math.floor(v)) return v;
    if (!memAnon) memAnon = 1000 + Math.floor(Math.random() * 9000);
    try { if (l) l.setItem(ANON, String(memAnon)); } catch (e) { }
    return memAnon;
  }
  function anonName() { return 'Jugador ' + anonNum(); }
  /** Apodo escrito a mano y guardado, si vale (mismas reglas que VB.NetRoom.cleanName y sin insultos); si no, ''. */
  function nick() {
    var l = LS(), s = '';
    try { s = l ? l.getItem(NICK) || '' : ''; } catch (e) { s = ''; }
    var NR = VB.NetRoom, c = NR && NR.cleanName ? NR.cleanName(s) : String(s).trim().slice(0, 16);
    return c && c.length >= 2 && c.indexOf('@') < 0 && !bad(c) ? c : '';
  }

  VB.NameFilter = { bad: bad, mask: mask, shown: shown, anonNum: anonNum, anonName: anonName, nick: nick, NICK: NICK, ANON: ANON, MSG: MSG,
    _norm: norm, _hash: hash };
})();
