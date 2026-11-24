/* TAKE THE COURT — js/senas.js (owner: ui_main)
 * Señas del árbitro como pegatina (idea «senas»): catálogo de las 11 señas oficiales que la UI enseña en lugar del texto del árbitro
 * (pestaña del punto o cinta), el pitido de cada una (audio.js) y el «Cuaderno del árbitro» del álbum (profile.js).
 * Puro: sin DOM, sin THREE y sin g.rng. La sim NO lo carga (la huella 2v2 no cambia): la seña ya la calcula sim.js (point.signal) y
 * aquí solo se lee. index.html lo carga después de js/look.js y antes de js/profile.js.
 *
 *   VB.Senas.LIST    [{id, name (álbum), word (pegatina), sigs (señales de la sim), rule (línea de reglamento), svg}]
 *   VB.Senas.BY      {id: entrada}
 *   VB.Senas.of(e)   evento 'point' (o g.lastPoint) → {id, word} | null. Usa e.signal y, si falta, e.reason (como arena.js
 *                    SIG_FROM_REASON). 'attackFault' se separa por reason: ataque / bloqueo / posición.
 *   VB.Senas.svg(id, word)  silueta SVG en línea (viewBox 0 0 48 48, tinta con currentColor); con la palabra «5 SEGUNDOS», la de playa.
 *
 * Señal de la sim → seña (pegatina):
 *   out → fuera (FUERA) · antenna → fuera (ANTENA) · touched → tocado (TOCADO) · four → cuatro (4 TOQUES) · double → dobles (DOBLES)
 *   net → red (RED) · netBall → red (A LA RED) · in con texto «… a la red» → red (A LA RED) · under → bajo (BAJO LA RED)
 *   attackFault + attackServe/backAttack → ataque (ATAQUE) · + block/backBlock → bloqueo (BLOQUEO) · + position → posicion (POSICIÓN)
 *   delay8 → retraso (8 SEGUNDOS) · delay5 → retraso (5 SEGUNDOS) · serveFault → saque (SAQUE)
 *   Fuera del catálogo: 'in' sin red (el «dentro» nunca lleva texto del árbitro) y 'penalty' (la tarjeta ya tiene su rótulo).
 *
 * LÍNEAS DE REGLAMENTO (decisión provisional: Ferran no las ha confirmado; «red» corregida el 21-nov y «posicion» decidida por Ferran el
 * 24-nov —sin la 1ª coma de su frase para caber en 80—, ver
 * notes/pendientes-ferran.md): en RULES, justo debajo, para que Ferran las corrija sin tocar nada más (≤ 80 caracteres cada una: caben en
 * 2 líneas del pie del álbum en el móvil).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  // ------------------------------------------------------------------ textos (fáciles de corregir)
  var RULES = {
    fuera: 'Regla 8.4: fuera si bota fuera de las líneas o toca la antena.',
    tocado: 'Si un jugador lo toca y el balón sale fuera, el punto lo pierde su equipo.',
    cuatro: 'Regla 9.3.1: como mucho 3 toques por equipo para devolver el balón.',
    dobles: 'Regla 9.3.4: un jugador no puede tocar el balón dos veces seguidas.',
    red: 'Regla 11.4.4: falta tocar la red entre las antenas al jugar el balón.',
    bajo: 'Regla 8.4.5: falta si el balón cruza entero por debajo de la red.',
    ataque: 'Regla 13.3: no se remata el saque rival por encima de la red en zona de ataque.',
    bloqueo: 'Regla 14.6: no se bloquea el saque, ni puede bloquear un zaguero o el líbero.',
    posicion: 'Reglas 7.4-7.5: al saque el equipo que recibe, cada uno en su sitio de rotación.',
    retraso: 'Regla 12.4.4: 8 segundos para sacar desde el silbato (5 en playa).',
    saque: 'Regla 12.4.1: el balón se lanza o se suelta y se golpea con una mano.'
  };

  // ------------------------------------------------------------------ siluetas (viewBox 0 0 48 48, todo tinta)
  var SH_L = [17.5, 21], SH_R = [30.5, 21];
  function f1(v) { return Math.round(v * 10) / 10; }
  function pts(a) { return a.map(function (p) { return f1(p[0]) + ' ' + f1(p[1]); }).join(' '); }
  /** Brazo: hombro → codo → muñeca (trazo grueso con puntas redondas). */
  function arm(a, w) { return '<polyline points="' + pts(a) + '" fill="none" stroke="currentColor" stroke-width="' + (w || 4.6) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  /** Mano plana (palma estirada): un trazo algo más fino desde la muñeca. */
  function paddle(a, b, w) { return '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) + '" stroke="currentColor" stroke-width="' + (w || 3.8) + '" stroke-linecap="round"/>'; }
  function line(a, b, w) { return paddle(a, b, w || 2.5); }
  /** Mano con n dedos hacia arriba (r = radio de la palma; big = mano de caricatura, para que los dedos se lean a 34 px). */
  function hand(x, y, n, r, len) {
    var s = '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="currentColor"/>', fw = r * 0.62, i;
    var sp = n <= 1 ? 0 : (n === 2 ? 0.42 : n === 3 ? 0.4 : 0.36);
    var k = Math.min(n, 4), a0 = -sp * (k - 1) / 2;
    for (i = 0; i < k; i++) {
      var a = a0 + sp * i;
      s += line([x + Math.sin(a) * r * 0.5, y - Math.cos(a) * r * 0.5], [x + Math.sin(a) * (r + len), y - Math.cos(a) * (r + len)], fw);
    }
    if (n >= 5) s += line([x - r * 0.6, y + r * 0.1], [x - r - len * 0.62, y - len * 0.08], fw);   // pulgar
    return s;
  }
  function arrowHead(x, y, ang) {   // punta de flecha rellena en (x, y) apuntando a ang (rad, 0 = arriba)
    var c = Math.cos(ang), s = Math.sin(ang), L = 4.2, W = 2.6;
    var bx = x - s * L, by = y + c * L;
    return '<path d="M' + f1(x) + ' ' + f1(y) + 'L' + f1(bx + c * W) + ' ' + f1(by + s * W) + 'L' + f1(bx - c * W) + ' ' + f1(by - s * W) + 'z" fill="currentColor"/>';
  }
  var BODY = '<circle cx="24" cy="10.6" r="4.7" fill="currentColor"/><path d="M16 19.6q8-3.6 16 0l-1.4 21.4h-13.2z" fill="currentColor"/>';
  var ARM_L_DOWN = arm([SH_L, [15.4, 30], [15.6, 38.5]]);
  var POSES = {
    fuera: arm([SH_L, [11.5, 30], [11.5, 19]]) + paddle([11.5, 19], [11.5, 13.5]) + arm([SH_R, [36.5, 30], [36.5, 19]]) + paddle([36.5, 19], [36.5, 13.5]),
    tocado: arm([SH_R, [37, 29], [37, 19]]) + paddle([37, 19], [37, 14.6]) + arm([SH_L, [25, 25.5], [31.5, 15.4]]) + paddle([31.5, 13.2], [41.4, 13.2], 3.4) +
      line([43.4, 10], [46.4, 7.8], 1.8) + line([44.4, 13.2], [47.4, 13.2], 1.8) + line([43.4, 16.4], [46.4, 18.6], 1.8),
    cuatro: ARM_L_DOWN + arm([SH_R, [37.5, 27.5], [37.5, 17.5]]) + hand(37.5, 14, 4, 3.9, 6.3),
    dobles: ARM_L_DOWN + arm([SH_R, [37.5, 27.5], [37.5, 17.5]]) + hand(37.5, 14, 2, 3.9, 6.8),
    red: ARM_L_DOWN + arm([SH_R, [35.5, 22], [39.5, 21.5]]) + paddle([39.5, 21.5], [41.6, 21.5], 4) +
      '<rect x="42.4" y="9" width="4.8" height="25" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      line([42.4, 15.2], [47.2, 15.2], 1.1) + line([42.4, 21.4], [47.2, 21.4], 1.1) + line([42.4, 27.6], [47.2, 27.6], 1.1) + line([44.8, 9], [44.8, 34], 1.1),
    bajo: ARM_L_DOWN + arm([SH_R, [35.5, 28.5], [38.6, 35.5]]) + '<circle cx="38.8" cy="35.8" r="2.6" fill="currentColor"/>' + line([39.4, 37], [41.6, 41.4], 1.9) +
      line([27, 45.4], [47, 45.4], 2.4),
    ataque: ARM_L_DOWN + arm([SH_R, [36, 27], [36, 15]]) + paddle([36, 15], [36, 9]) +
      '<path d="M40 4.4q7 4.4 3.6 15.2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' + arrowHead(43, 22.4, 2.9),
    bloqueo: arm([SH_L, [15, 12.5], [15, 6]]) + paddle([15, 6], [15, 1.8], 4.6) + arm([SH_R, [33, 12.5], [33, 6]]) + paddle([33, 6], [33, 1.8], 4.6),
    posicion: ARM_L_DOWN + arm([SH_R, [35.5, 26], [35.5, 16]]) + '<circle cx="35.5" cy="14.4" r="2.8" fill="currentColor"/>' + line([35.5, 13], [35.5, 6.6], 1.9) +
      '<path d="M38.4 13.6A5 5 0 1 0 41.4 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' + arrowHead(38.4, 5.4, -1.75),
    retraso: arm([SH_L, [10.5, 26], [10.5, 17]]) + hand(10.5, 14, 5, 3.3, 4.6) + arm([SH_R, [37.5, 26], [37.5, 17]]) + hand(37.5, 14, 3, 3.3, 5.2),
    retraso5: ARM_L_DOWN + arm([SH_R, [37.5, 26], [37.5, 17]]) + hand(37.5, 14, 5, 3.5, 5.2),
    saque: ARM_L_DOWN + arm([SH_R, [37, 19], [42, 15]]) + paddle([40.6, 13.4], [46.4, 13.4], 3.4) +
      line([43.6, 10.4], [43.6, 4.8], 2.5) + arrowHead(43.6, 1.6, 0)
  };
  function svg(id, word) {
    var k = id === 'retraso' && /^5/.test(word || '') ? 'retraso5' : id;
    if (!POSES[k]) return '';
    return '<svg class="sn-sil" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + BODY + POSES[k] + '</svg>';
  }

  // ------------------------------------------------------------------ catálogo
  var LIST = [
    { id: 'fuera', name: 'Fuera', word: 'FUERA', sigs: ['out', 'antenna'] },
    { id: 'tocado', name: 'Balón tocado', word: 'TOCADO', sigs: ['touched'] },
    { id: 'cuatro', name: 'Cuatro toques', word: '4 TOQUES', sigs: ['four'] },
    { id: 'dobles', name: 'Dobles', word: 'DOBLES', sigs: ['double'] },
    { id: 'red', name: 'Red', word: 'RED', sigs: ['net', 'netBall'] },
    { id: 'bajo', name: 'Balón bajo la red', word: 'BAJO LA RED', sigs: ['under'] },
    { id: 'ataque', name: 'Falta de ataque', word: 'ATAQUE', sigs: ['attackFault'] },
    { id: 'bloqueo', name: 'Falta de bloqueo', word: 'BLOQUEO', sigs: ['attackFault'] },
    { id: 'posicion', name: 'Falta de posición', word: 'POSICIÓN', sigs: ['attackFault'] },
    { id: 'retraso', name: 'Retraso en el saque', word: '8 SEGUNDOS', sigs: ['delay8', 'delay5'] },
    { id: 'saque', name: 'Saque sin golpear', word: 'SAQUE', sigs: ['serveFault'] }
  ];
  var BY = {};
  LIST.forEach(function (s) { s.rule = RULES[s.id] || ''; s.svg = svg(s.id, s.word); BY[s.id] = s; });

  // la misma tabla que arena.js SIG_FROM_REASON (por si un evento viejo no trae signal)
  var SIG_FROM_REASON = { 'in': 'in', out: 'out', antenna: 'antenna', 'double': 'double', four: 'four', net: 'net', under: 'under', block: 'attackFault',
    attackServe: 'attackFault', backAttack: 'attackFault', backBlock: 'attackFault', position: 'attackFault' };
  var NET_RE = /a la red$/i;
  function mk(id, word) { return { id: id, word: word || BY[id].word }; }
  /** Evento 'point' → {id, word} | null. */
  function of(e) {
    if (!e || typeof e !== 'object') return null;
    var r = e.reason || '', t = typeof e.text === 'string' ? e.text : '', s = e.signal;
    if (!s) s = r === 'serve' ? (/8/.test(t) ? 'delay8' : /5/.test(t) ? 'delay5' : 'serveFault') : SIG_FROM_REASON[r] || '';
    switch (s) {
      case 'out': return r === 'antenna' ? mk('fuera', 'ANTENA') : mk('fuera');
      case 'antenna': return mk('fuera', 'ANTENA');
      case 'touched': return mk('tocado');
      case 'four': return mk('cuatro');
      case 'double': return mk('dobles');
      case 'net': return mk('red');
      case 'netBall': return mk('red', 'A LA RED');
      case 'under': return mk('bajo');
      case 'attackFault':
        if (r === 'block' || r === 'backBlock') return mk('bloqueo');
        if (r === 'position') return mk('posicion');
        return mk('ataque');
      case 'delay8': return mk('retraso');
      case 'delay5': return mk('retraso', '5 SEGUNDOS');
      case 'serveFault': return mk('saque');
      case 'in': return NET_RE.test(t) ? mk('red', 'A LA RED') : null;   // balón a la red que cae en su propio campo
    }
    return null;
  }

  VB.Senas = { LIST: LIST, BY: BY, RULES: RULES, of: of, svg: svg };
})();
