/* TAKE THE COURT — js/semana-ui.js (owner: ui_main)
 * Pintado de «La situación de la semana» (datos de js/semana.js, VB.Semana). Va aparte de ui.js porque hay un rediseño de menús en
 * marcha: ui.js solo llama a estas piezas (pestaña «Semana» de Retos, compartir) y las pinta con el estilo SPLAT (notes/splat.md).
 * CSS propio: index.html «SPLAT · RETOS · SEMANA» (clases .sem-*).
 *
 * API (VB.SemanaUI):
 *   tabHTML(mode 'S'|'A') → HTML de la pestaña: columna izquierda (brochazo con el marcador, pegatinas, intentos de hoy, «¡A jugar!» y
 *                           «Compartir») y derecha («Mapa del grupo»: campo rival con un punto por amigo en cada zona y la lista).
 *                           Botones: [data-sem="go"], [data-sem="share"], [data-semmap="S"|"A"].
 *   foot() → HTML del pie («Semana 47 | Cambia el lunes»)
 *   mapSVG(list, mode, me) → SVG del campo rival (zonas [1,6,5 / 2,3,4], la red abajo, de tu lado)
 *   share(cb?)             navigator.share con el enlace; si no hay, al portapapeles con el aviso «Enlace copiado»
 *   PAL                    8 colores de los puntos del grupo (tokens --sp-* y tres más con contraste ≥ 3:1 sobre la pista)
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var PAL = ['var(--sp-kit)', 'var(--sp-gold)', 'var(--sp-teal)', 'var(--sp-alt)', 'var(--sp-cream)', '#c4a2ff', '#ff9ad2', '#7fd0ff'];
  var SHARE_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shown(n) { return String(n || '').replace(/_/g, ' '); }
  function S() { return VB.Semana || null; }
  function sep(a) { return a.filter(Boolean).map(esc).join('<span class="sep sep-v"><span class="sr">, </span></span>'); }

  /** Lista que se pinta: la cadena guardada y, en la semana en curso, tu mejor (aunque aún no la hayas compartido). */
  function groupList(st) {
    var g = st.group, list = g ? g.list.map(function (e) { return { n: e.n, w: e.w, a: e.a, b: e.b, S: e.S, A: e.A }; }) : [];
    if (!st.groupOld && st.best) {
      var mine = null; for (var i = 0; i < list.length; i++) if (list[i].n === st.me) mine = list[i];
      var b = st.best, e = { n: st.me, w: b.w, a: b.a, b: b.b, S: b.S, A: b.A };
      if (mine) { mine.w = e.w; mine.a = e.a; mine.b = e.b; mine.S = e.S; mine.A = e.A; } else list.push(e);
    }
    return list;
  }
  /** Campo rival visto desde tu lado: atrás 1-6-5, delante 2-3-4 y la red abajo. Un punto (con la inicial) por amigo en cada zona. */
  function mapSVG(list, mode, me) {
    var W = 240, H = 134, x0 = 10, y0 = 6, cw = 220, ch = 108, back = 72, cols = [1, 6, 5, 2, 3, 4];
    var h = '<svg class="sem-map" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(mapAria(list, mode)) + '">' +
      '<rect class="sem-cf" x="' + x0 + '" y="' + y0 + '" width="' + cw + '" height="' + ch + '" rx="3"/>' +
      '<path class="sem-cl" d="M' + x0 + ' ' + (y0 + back) + 'H' + (x0 + cw) + 'M' + (x0 + cw / 3) + ' ' + y0 + 'V' + (y0 + ch) + 'M' + (x0 + cw * 2 / 3) + ' ' + y0 + 'V' + (y0 + ch) + '"/>' +
      '<rect class="sem-cb" x="' + x0 + '" y="' + y0 + '" width="' + cw + '" height="' + ch + '" rx="3"/>' +
      '<path class="sem-net" d="M' + (x0 - 6) + ' ' + (y0 + ch + 6) + 'H' + (x0 + cw + 6) + '"/><text class="sem-nt" x="' + (x0 + cw / 2) + '" y="' + (H - 1) + '">RED</text>';
    for (var c = 0; c < 6; c++) {
      var z = cols[c], cx = x0 + (c % 3) * cw / 3, cy = c < 3 ? y0 : y0 + back, zh = c < 3 ? back : ch - back;
      h += '<text class="sem-zn" x="' + (cx + 5) + '" y="' + (cy + 11) + '">' + z + '</text>';
      var who = [];
      for (var i = 0; i < list.length; i++) if (String(list[i][mode] || '').indexOf(String(z)) >= 0) who.push(i);
      var show = who.length > 6 ? 5 : who.length, r = c < 3 ? 8 : 6.5;
      for (var k = 0; k < show; k++) {
        var col = k % 3, row = Math.floor(k / 3), px = cx + cw / 6 + (col - 1) * (r * 2 + 3), py = cy + zh / 2 + (show > 3 ? (row ? 1 : -1) * (r + 1.5) : 0) + (c < 3 ? 4 : 2);
        var e = list[who[k]], ini = shown(e.n).charAt(0).toUpperCase() || '?';
        h += '<g class="sem-pt' + (e.n === me ? ' me' : '') + '"><circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r + '" style="fill:' + PAL[who[k] % PAL.length] + '"/>' +
          '<text x="' + px.toFixed(1) + '" y="' + (py + r * 0.42).toFixed(1) + '" style="font-size:' + (r * 1.2).toFixed(1) + 'px">' + esc(ini) + '</text></g>';
      }
      if (who.length > 6) {
        var qx = cx + cw / 6 + (r * 2 + 3), qy = cy + zh / 2 + (r + 1.5) + (c < 3 ? 4 : 2);
        h += '<text class="sem-more" x="' + qx.toFixed(1) + '" y="' + (qy + 3).toFixed(1) + '">+' + (who.length - 5) + '</text>';
      }
    }
    return h + '</svg>';
  }
  function mapAria(list, mode) {
    var n = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (e) { for (var z = 1; z <= 6; z++) if (String(e[mode] || '').indexOf(String(z)) >= 0) n[z]++; });
    var parts = []; for (var z = 1; z <= 6; z++) if (n[z]) parts.push('zona ' + z + ': ' + n[z]);
    return 'Mapa del grupo, ' + (mode === 'A' ? 'ataque' : 'saque') + (parts.length ? '. ' + parts.join(', ') : ', sin datos');
  }
  function tabHTML(mode, vw) {
    var M = S(); if (!M) return '<p class="rt-none">La situación de la semana no está disponible.</p>';
    mode = mode === 'A' ? 'A' : 'S';
    var st = M.state(), sit = st.sit, wn = M.wkNum(st.wk), a = sit.score[0], b = sit.score[1];
    var ball = VB.Splat && VB.Splat.BALL ? VB.Splat.BALL : '';
    // columna izquierda: brochazo turquesa con el sello, el marcador grande y las pegatinas
    var chips = '', KEEP = {}; KEEP[sit.mapName] = 1; KEEP[sit.diffName] = 1;
    // bajo el marcador, en una línea: «3r set a 15 | Saca el rival» (+ «6 contra 6 | Rotación 4»); en pegatina, sede, nivel y «Atributos parejos»
    var sub = [sit.famLbl, sit.srvLbl].concat(sit.six ? ['6 contra 6', sit.rotLbl] : []);
    [sit.mapName, sit.diffName, 'Atributos parejos'].forEach(function (c) { chips += '<i class="sp-chip ' + (c === 'Atributos parejos' ? 'sp-cream sem-cx' : 'sp-ink') + '">' + esc(c) + '</i>'; });
    var aria = 'La situación de la semana ' + wn + ': ' + sit.label + '. ' + sit.chips.slice(2).join(', ');
    var h = '<div class="sem-l"><div class="sem-tk sp-ticket sp-noshine" data-shape="3" role="group" aria-label="' + esc(aria) + '">' +
      '<span class="sp-stamp sem-stamp" aria-hidden="true" data-ring="LA SITUACIÓN ★ SEMANA ' + wn + ' ★"><span class="sp-sc">' + ball + '<b>S' + wn + '</b></span></span>' +
      '<div class="sem-tm" aria-hidden="true"><p class="sem-k">La situación de la semana</p><p class="sem-sc">' + a + '<i>-</i>' + b + '</p><p class="sem-sub">' + sep(sub) + '</p><p class="sem-ch">' + chips + '</p></div></div>';
    // intentos de hoy: llena = gastado, dorada = ganado; el que está abierto (a medias) cuenta como gastado
    var dots = '';
    for (var i = 0; i < M.TRIES; i++) { var t = st.today[i], used = i < st.n; dots += '<i class="sem-dot' + (used ? ' used' : '') + (t && t.w ? ' won' : '') + '"></i>'; }
    var bestT = st.best ? 'Mejor: ' + M.resLbl(st.best).toLowerCase() : 'Aún sin jugar esta semana';
    var triesA = 'Hoy: ' + st.n + (st.n === 1 ? ' intento de 3' : ' intentos de 3');
    h += '<div class="sem-tries"><span class="sem-dots" role="img" aria-label="' + esc(triesA) + '">' + dots + '</span><small class="sem-tt">' + esc(bestT) + '</small></div>';
    var go = st.left > 0;
    h += '<div class="sem-acts"><button class="mi primary sem-go sp-patch' + (go ? '' : ' off') + '" data-sem="go"' + (go ? '' : ' aria-disabled="true"') + '><span class="sp-l"><span class="sp-t">' + (go ? '¡A jugar!' : 'Mañana más') + '</span>' +
      '<small class="sp-s">' + esc(go ? (st.left === 1 ? 'Queda 1 hoy' : 'Quedan ' + st.left + ' hoy') : 'Mañana, 3 nuevos') + '</small></span></button>' +
      (st.best ? '<button class="sp-btn sp-sm sp-ink sem-share" data-sem="share" data-shape="1" aria-label="Compartir tu resultado" title="Compartir"><span class="sp-ic">' + SHARE_IC + '</span><span class="sp-t sem-st">Compartir</span></button>' : '') + '</div></div>';
    // columna derecha: el mapa del grupo
    var list = groupList(st);
    // (móvil, movil-aire §5.6: con lista del grupo, la columna derecha enseña UNA cosa a toda la altura, el mapa o la lista, con un
    //  segmento «Mapa | Grupo (3)» de 44; .ph-only: en PC no sale y se ven las dos como siempre)
    var vwOn = list.length > 0, isList = vwOn && vw === 'list';
    if (vwOn) h += '<div class="sem-r sem-vwh" data-vw="' + (isList ? 'list' : 'map') + '"><span class="sem-vw ph-only" role="radiogroup" aria-label="Qué enseña la columna">' +
      '<button type="button" role="radio" data-semvw="map" aria-checked="' + !isList + '"' + (isList ? '' : ' class="on"') + '>Mapa</button>' +
      '<button type="button" role="radio" data-semvw="list" aria-checked="' + isList + '"' + (isList ? ' class="on"' : '') + '>Grupo (' + list.length + ')</button></span>';
    h += (vwOn ? '' : '<div class="sem-r">') + '<div class="sem-gh"><b>Mapa del grupo</b><span class="sem-seg" role="radiogroup" aria-label="Qué enseña el mapa">' +
      '<button type="button" role="radio" data-semmap="S" aria-checked="' + (mode === 'S') + '"' + (mode === 'S' ? ' class="on"' : '') + '>Saque</button>' +
      '<button type="button" role="radio" data-semmap="A" aria-checked="' + (mode === 'A') + '"' + (mode === 'A' ? ' class="on"' : '') + '>Ataque</button></span></div>' +
      mapSVG(list, mode, st.me);
    if (st.groupOld && st.group) h += '<p class="sem-old">Cadena de la semana ' + M.wkNum(st.group.wk) + ' (ya cerrada)</p>';
    if (list.length) {
      h += '<ul class="sem-list">';
      list.forEach(function (e, i) {
        var me = e.n === st.me;
        h += '<li class="' + (me ? 'me' : '') + '"><i class="sem-c" style="background:' + PAL[i % PAL.length] + '"></i><span class="sem-n" data-ph-ell>' + esc(shown(e.n)) + '</span>' +
          (me ? '<em class="sem-you">Tú</em>' : '') + '<b class="sem-r1 ' + (e.w ? 'w' : 'l') + '">' + esc(M.resLbl(e)) + '</b></li>';
      });
      h += '</ul>';
    }
    if (!list.length || (list.length === 1 && list[0].n === st.me)) h += '<p class="sem-empty">Comparte tu resultado y el mapa se llena con el de tus amigos</p>';
    return h + '</div>';
  }
  function foot() {
    var M = S(); if (!M) return '';
    var wk = M.week();
    return '<span class="nw">Semana <b>' + M.wkNum(wk) + '</b></span><span class="sep sep-v"><span class="sr">, </span></span><span class="nw">Cambia el lunes</span>' +
      '<span class="sep sep-v"><span class="sr">, </span></span><span class="nw">Sin XP ni medallas</span>';
  }
  function toast(t) { try { if (VB.Splat && VB.Splat.toast) VB.Splat.toast(esc(t), { key: 'sem' }); } catch (e) { } }
  function copy(txt, cb) {
    var done = function (ok) { toast(ok ? 'Enlace copiado' : 'No se ha podido copiar el enlace'); if (cb) cb(ok ? 'copied' : 'fail'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(legacy(txt)); }); return; }
    } catch (e) { }
    done(legacy(txt));
  }
  function legacy(txt) {
    try {
      var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); return !!ok;
    } catch (e) { return false; }
  }
  /** Compartir: el sistema (móvil) o el portapapeles. cb('shared' | 'copied' | 'fail' | 'cancel'). */
  function share(cb) {
    var M = S(); if (!M) return;
    var url = M.link(), text = M.shareText();
    if (navigator.share) {
      try { navigator.share({ title: 'Take the Court', text: text, url: url }).then(function () { if (cb) cb('shared'); }, function (e) { if (e && e.name === 'AbortError') { if (cb) cb('cancel'); } else copy(text + ' ' + url, cb); }); return; }
      catch (e) { }
    }
    copy(text + ' ' + url, cb);
  }
  VB.SemanaUI = { tabHTML: tabHTML, foot: foot, mapSVG: mapSVG, share: share, groupList: groupList, PAL: PAL };
})();
