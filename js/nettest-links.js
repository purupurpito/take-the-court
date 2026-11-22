/* =====================================================================
 * TAKE THE COURT — js/nettest-links.js   (owner: net, P0 del sprint online-multi; notes/online-multi-brief.md §7)
 * Enlaces de PRUEBA para N pares (Node / pruebas; SIN DOM y SIN THREE). Se carga DESPUÉS de js/net.js y solo en las pruebas
 * (tools/net4test.js, tools/net12test.js…); index.html no lo carga. memPair (net.js) no cambia: sigue siendo el par de siempre.
 *
 * API (se añade a VB.Net):
 *   memMesh({n, rtt, jit, loss, seed, clock}) → malla completa en memoria: un enlace por PAR DIRIGIDO, cada sentido con su Shaper
 *       (el simulador de red de net.js: lag = RTT, ida = RTT/2, jit = ± de un sentido, loss = % solo del canal 'in').
 *       rtt / jit / loss: número (igual para todos) o función (i, j) → número (del par i→j; la ida usa rtt(i,j)/2).
 *       Devuelve M = {n, links, link(i,j), set(i,j,k,v), down(ms[, i, j]), flush(), traffic(), rttOf(i,j), close()}:
 *         links[i][j] = el enlace de la máquina i hacia la j (null si i === j), con la forma de siempre:
 *           {send(ch, data), poll(now) → [{ch, data}], down(ms), flush(), set(k, v), close(), peer: j, from: i}
 *         traffic() → [[{pk, bytes, inPk, inB, ctlPk, ctlB}]] por par dirigido (lo que SALE de i hacia j por el cable, también lo perdido)
 *       Con n = 2 y la misma semilla, links[0][1] / links[1][0] dan EXACTAMENTE lo que memPair (mismas semillas de los Shaper,
 *       mismo orden de entrega): tools/net4test.js lo comprueba.
 *   memStar({n, rtt, jit, loss, seed, clock, relay}) → estrella con el anfitrión (máquina 0) en el centro: solo existen los enlaces
 *       0↔k (rtt(k) o rtt(0,k) del tramo invitado–anfitrión). Con relay (por defecto true) también da enlaces VIRTUALES invitado↔invitado
 *       que pasan por el anfitrión: retraso = tramo g1→0 + tramo 0→g2 (cada uno con su Shaper, su variación y su pérdida), y su
 *       tráfico cuenta en los DOS tramos (la subida del anfitrión es lo que importa). Sin relay, links[g1][g2] = null (el reenvío lo
 *       hace la capa de arriba, P2). rttOf(i, j) = RTT efectivo (por el anfitrión si i, j son invitados).
 *   Mismo reloj común para todos (o.clock, el de la prueba); los desfases de reloj de cada máquina los pone el banco de pruebas.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var Net = VB.Net;
  if (!Net || !Net.Shaper) { if (typeof console !== 'undefined') console.error('nettest-links.js: falta js/net.js (VB.Net.Shaper)'); return; }
  var Shaper = Net.Shaper;

  function fnOf(v, def) { return typeof v === 'function' ? v : function () { return v == null ? def : +v; }; }
  function sizeOf(d) { return d == null ? 0 : typeof d === 'string' ? d.length : (d.byteLength != null ? d.byteLength : 0); }
  function newTraf() { return { pk: 0, bytes: 0, inPk: 0, inB: 0, ctlPk: 0, ctlB: 0 }; }
  function count(t, ch, d) { var n = sizeOf(d); t.pk++; t.bytes += n; if (ch === 'in') { t.inPk++; t.inB += n; } else { t.ctlPk++; t.ctlB += n; } }
  // semilla del Shaper del sentido i→j: con n = 2, las de memPair (seed*2+1 para 0→1, seed*2+2 para 1→0)
  function seedOf(seed, n, i, j) { return n === 2 ? seed * 2 + 1 + i : (seed * 1009 + i * n + j + 1) >>> 0; }

  /** Núcleo común: n máquinas, una cola de entrada por par dirigido (lo que i recibe de j) y un Shaper por tramo físico. */
  function build(o, phys) {
    o = o || {};
    var n = Math.max(2, o.n | 0), seed = o.seed || 1;
    var clock = o.clock || function () { return Date.now(); };
    var rtt = fnOf(o.rtt != null ? o.rtt : o.lag, 0), jit = fnOf(o.jit, 0), loss = fnOf(o.loss, 0);
    var sh = [], q = [], traf = [], cnt = [], i, j;
    for (i = 0; i < n; i++) {
      sh.push([]); q.push([]); traf.push([]); cnt.push([]);
      for (j = 0; j < n; j++) {
        var ok = i !== j && phys(i, j);
        sh[i].push(ok ? new Shaper({ lag: rtt(i, j), jit: jit(i, j), loss: loss(i, j) }, seedOf(seed, n, i, j)) : null);
        q[i].push([]); traf[i].push(newTraf()); cnt[i].push(0);
      }
    }
    // ruta de i a j: [i, j] directa o [i, 0, j] por el anfitrión (estrella con reenvío)
    function route(i, j) { return sh[i][j] ? [i, j] : (o.relay !== false && !phys(i, j) && sh[i][0] && sh[0][j]) ? [i, 0, j] : null; }
    function mk(i, j) {
      var r = route(i, j); if (!r) return null;
      return {
        from: i, peer: j, hops: r.length - 1,
        send: function (ch, data) {
          var now = clock(), at = now;
          for (var h = 0; h + 1 < r.length; h++) {
            count(traf[r[h]][r[h + 1]], ch, data);
            at = sh[r[h]][r[h + 1]].due(ch, at); if (at < 0) return;   // (perdido en este tramo: el siguiente ni lo ve)
          }
          var d = data instanceof Uint8Array ? new Uint8Array(data) : data;
          q[j][i].push({ at: at, ch: ch, data: d, n: cnt[j][i] = cnt[j][i] + 1 });
        },
        poll: function () {
          var now = clock(), out = [], keep = [], Q = q[i][j];
          Q.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
          for (var k = 0; k < Q.length; k++) { var m = Q[k]; if (m.at <= now) out.push({ ch: m.ch, data: m.data }); else keep.push(m); }
          q[i][j] = keep; return out;
        },
        // como en memPair: corta los dos sentidos de ESTE par (todos sus tramos)
        down: function (ms) { var t = clock() + ms; for (var h = 0; h + 1 < r.length; h++) { sh[r[h]][r[h + 1]].down = t; sh[r[h + 1]][r[h]].down = t; } },
        flush: function () { q[i][j].length = 0; q[j][i].length = 0; },
        set: function (k, v) { for (var h = 0; h + 1 < r.length; h++) { sh[r[h]][r[h + 1]][k] = v; sh[r[h + 1]][r[h]][k] = v; } },
        close: function () { }
      };
    }
    var links = [];
    for (i = 0; i < n; i++) { links.push([]); for (j = 0; j < n; j++) links[i].push(i === j ? null : mk(i, j)); }
    var M = {
      n: n, links: links,
      link: function (i, j) { return links[i] && links[i][j] || null; },
      /** cambia lag/jit/loss del tramo físico i→j (solo ese sentido) */
      set: function (i, j, k, v) { if (sh[i][j]) sh[i][j][k] = v; },
      /** corta la red ms: toda (sin i) o solo los tramos físicos de la máquina i (con j, solo el par i↔j) */
      down: function (ms, i, j) {
        var t = clock() + ms;
        for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) if (sh[a][b] && (i == null || ((a === i || b === i) && (j == null || a === j || b === j)))) sh[a][b].down = t;
      },
      flush: function () { for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) q[a][b].length = 0; },
      traffic: function () { return traf; },
      rttOf: function (a, b) { var r = route(a, b); if (!r) return -1; var s = 0; for (var h = 0; h + 1 < r.length; h++) s += sh[r[h]][r[h + 1]].lag / 2 + sh[r[h + 1]][r[h]].lag / 2; return s; },
      close: function () { }
    };
    return M;
  }

  function memMesh(o) { return build(o, function () { return true; }); }
  function memStar(o) {
    o = o || {}; var p = {}, k;
    for (k in o) p[k] = o[k];
    // rtt(k) del tramo invitado–anfitrión: se acepta f(k) o f(i, j) (con i o j = 0)
    if (typeof o.rtt === 'function' && o.rtt.length < 2) { var f = o.rtt; p.rtt = function (i, j) { return f(i === 0 ? j : i); }; }
    return build(p, function (i, j) { return i === 0 || j === 0; });
  }

  Net.memMesh = memMesh; Net.memStar = memStar;
})();
