/* MAKE THE CUT — js/career-train-ui.js (owner: ui_main)
 * Pantallas de los entrenos con el club (VB.CareerTrainUI, sprint 2-4, tarea T12; spec T-training §2.5), dentro del hub de career-ui.js:
 *  - Partido: tarjeta de la sesión (.ct-card), debajo de la de Faro y encima de la del partido. Estados: sin empezar, a medias, hecha
 *    y simulada. Sus botones son secundarios: «Jugar partido» sigue siendo la única acción en cómic.
 *  - Jugador › Entreno: tarjeta «Entrenos con el club» (trainHTML) con el progreso de cada atributo y las medallas.
 *  - Palmarés › Opciones: «Entrenos con el club: 2 ejercicios | 1 ejercicio | No» (optsHTML).
 * Solo devuelve HTML; las acciones (data-act="ct-…") las atiende career-ui.js (onClick → act). Datos: career-train.js.
 * Mismo contrato que CareerWorldUI: recibe HLP con esc/sp. act(a, b) → {go: id} (career-ui cierra y llama a
 * ctx.actions.startCareerDrill(id)) o {render: true, focus}. Sin career-train.js, todo devuelve '' / null.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  function T() { return VB.CareerTrain; }
  function C() { return VB.Career; }
  var H = null;
  function esc(s) { return H && H.esc ? H.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';'; }); }
  function sp(a, k) { return H && H.sp ? H.sp(a, k) : a.join(' | '); }
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function myClub(c) { var B = C() && (C().beach || C()); try { return B && B.club ? B.club(c, c.myClub) : null; } catch (e) { return null; } }
  function mateFirst(c) { var n = c && c.mate && c.mate.name ? String(c.mate.name) : ''; return n.split(' ')[0] || 'tu pareja'; }
  // medalla (copia de medalSVG de ui.js; los estilos .mdl están en index.html)
  function medalSVG(m, extra) {
    return '<svg class="mdl m' + (m | 0) + (extra ? ' ' + extra : '') + '" viewBox="0 0 32 32" aria-hidden="true"><path class="rb" d="M8.5 1.5h6.5l3.2 9.5h-6.6z"/><path class="rb rb2" d="M23.5 1.5H17l-3.2 9.5h6.6z"/>' +
      '<circle class="dk" cx="16" cy="20.5" r="9"/><path class="st" d="M16 15.2l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"/></svg>';
  }
  var TITLE = { week: 'Entreno de la semana', pre: 'Pretemporada', plan: 'Plan de partido' };
  var MEDAL = ['Sin medalla', 'Bronce', 'Plata', 'Oro'];

  var CSS = [
    '#career .ct-card{display:block}',
    // TV D1 (plano): franja verde a la izquierda; misma especificidad que .cw-mentor (gana a la regla plana de index.html sin !important)
    '#app #career .card.ct-card:not(.lf-ch):not(.confirm){background:linear-gradient(90deg,rgba(75,224,160,.16),rgba(75,224,160,0) 60%),var(--flat,rgba(46,39,86,.95));',
    ' box-shadow:0 0 0 1.5px var(--tk),inset 4px 0 0 #4be0a0,var(--flat-sh,0 2px 0 var(--tk))}',
    '#app #career .ct-card button.ct-ok:not(.pri):not(.warn):not([aria-pressed="true"]):not(.tab):not(.tb-k){background:rgba(75,224,160,.22);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(75,224,160,.85),var(--flat-sh,0 2px 0 var(--tk))}',
    '#app #career .ct-card button.ct-ok:not(.pri):not(.warn):not([aria-pressed="true"]):not(.tab):not(.tb-k):hover{background:rgba(75,224,160,.34)}',
    '#app #career .ct-card button.ct-ok:not(.pri):not(.warn):not([aria-pressed="true"]):not(.tab):not(.tb-k):is(:focus-visible,.kf){background:rgba(75,224,160,.34);box-shadow:var(--ring-f,inset 0 0 0 3px #ffb238),var(--flat-sh,0 2px 0 var(--tk))}',
    '#career .ct-who{display:block;font:800 11.5px var(--display);letter-spacing:.1em;text-transform:uppercase;color:#8ff0c4;text-shadow:none}',
    '#career .ct-card h3{margin:1px 0 4px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}',
    '#career .ct-card h3 .mdl{width:24px;height:24px}',
    '#career .ct-n{font:700 12px var(--ui);color:var(--soft,#cfc8f2);letter-spacing:0;text-transform:none}',
    '#career .ct-line{font:600 15px/1.32 var(--ui);margin:2px 0 6px}',
    '#career .ct-rows{display:grid;gap:4px;margin:4px 0}',
    '#career .ct-row{display:grid;grid-template-columns:auto minmax(0,7.5em) minmax(0,1fr) auto;gap:8px;align-items:center;font:600 14px var(--ui)}',
    '#career .ct-row .mdl{width:26px;height:26px}',
    '#career .ct-row b{font:800 14.5px var(--ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#career .ct-row .ct-a{display:block;font:600 12.5px var(--ui);color:var(--muted)}',
    '#career .ct-bar{height:9px;border-radius:6px;background:rgba(0,0,0,.4);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}',
    '#career .ct-bar i{display:block;height:100%;background:#4be0a0}',
    '#career .ct-row small{font:800 13px var(--display);min-width:3.6em;text-align:right}',
    '#career .ct-foot{margin:6px 0 0}',
    '#career .ct-card .acts{margin:8px 0 0}',
    '#career .ct-card .acts small{font:600 12px var(--ui);text-transform:none;letter-spacing:0}',
    '#career .ct-tags{margin:2px 0}',
    '#career .ct-pr{display:grid;grid-template-columns:minmax(0,7.5em) minmax(0,1fr) 4.2em;gap:8px;align-items:center;margin:6px 0}',
    '#career .ct-pr b{font:800 14px var(--display);text-align:right}',
    '#career .ct-opt{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 0}',
    '#career .ct-opt b{font:700 16px var(--ui);letter-spacing:0;text-transform:none;margin-right:auto}',
    // teléfono apaisado: tarjeta baja (sin pie ni quién elige) para que «Jugar partido» siga a la vista
    '@media (max-height:420px){',
    ' #career .ct-card{padding:6px 10px}',
    ' #career .ct-who,#career .ct-foot{display:none}',
    ' #career .ct-card h3{font-size:15px;margin:0 0 2px}',
    ' #career .ct-line{font-size:13.5px;line-height:1.25;margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    ' #career .ct-rows{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:2px 10px}',
    ' #career .ct-row{grid-template-columns:auto minmax(0,1fr) auto;gap:6px}',
    ' #career .ct-row .ct-bar{display:none}',
    ' #career .ct-card .acts{margin:4px 0 0;display:flex;flex-wrap:nowrap;gap:8px}',
    ' #career .ct-card .acts button{flex:none;min-height:44px;padding:0 12px;font-size:15px}',
    '}',
    '.is-touch #career .ct-card .acts button,.is-touch #career .ct-opt button{min-height:44px}'
  ].join('\n');
  function css() { if (typeof document === 'undefined' || document.getElementById('careerTrainCss')) return; var s = document.createElement('style'); s.id = 'careerTrainCss'; s.textContent = CSS; document.head.appendChild(s); }

  function attrL(a) { return T().attrLabel(a); }
  function bar(v) { return '<span class="ct-bar"><i style="width:' + Math.max(0, Math.min(100, v | 0)) + '%"></i></span>'; }
  function rowOf(c, s, id) {
    var a = T().attrOf(id), e = null;
    for (var i = 0; i < s.r.length; i++) if (s.r[i].id === id) e = s.r[i];
    var p = c.tpa ? c.tpa[a] | 0 : 0;
    return '<div class="ct-row">' + medalSVG(e ? e.m : 0) + '<span><b>' + esc(T().drillShort(id)) + '</b><span class="ct-a">' + esc(attrL(a)) + ' ' + (c.player.st[a] | 0) + '</span></span>' +
      bar(p) + '<small>' + p + '/100</small></div>';
  }

  // ---------------------------------------------------------------- Partido: tarjeta de la sesión
  function card(c, h0) {
    H = h0; css();
    if (!T() || !c || !c.player) return '';
    var s = T().cur(c); if (!s) return '';
    var hall = isH(c), k = myClub(c);
    var who = s.who === 'faro' ? sp(['Faro', 'Tu mentor'], 'd') : sp(['El entrenador', esc(k ? k.short : 'Tu club')], 'd');
    var title = TITLE[s.kind] || TITLE.week, n = s.d.length, done = s.r.length;
    var h = '<div class="card ct-card" role="region" aria-label="' + esc(title) + '"><small class="ct-who">' + who + '</small>';
    if (s.st === 'open') {
      h += '<h3>' + esc(title) + (done ? ' <span class="ct-n">' + done + '/' + n + '</span>' : '') + '</h3>' +
        '<p class="ct-line">«' + esc(s.line) + '»</p>' +
        '<div class="ct-rows">' + s.d.map(function (id) { return rowOf(c, s, id); }).join('') + '</div>' +
        '<p class="muted ct-foot">' + (hall ? 'Bronce, plata u oro: sube lo que entrenas, la confianza del entrenador y la química del equipo. El seis de la próxima jornada también lo tiene en cuenta.'
          : 'Bronce, plata u oro: sube lo que entrenas, la confianza del entrenador y la química con ' + esc(mateFirst(c)) + '.') + '</p>';
      var nx = T().pending(c);
      h += '<div class="acts">' + (done
        ? '<button class="ct-ok" data-act="ct-go" data-id="' + esc(nx || '') + '">Seguir entrenando</button><button data-act="ct-end">Terminar aquí</button>'
        : '<button class="ct-ok" data-act="ct-go" data-id="' + esc(nx || '') + '">Entrenar</button><button data-act="ct-sim">Simular <small>(menos progreso)</small></button>') + '</div>';
      return h + '</div>';
    }
    // hecha o simulada
    var g = s.g, mName = MEDAL[g > 0 ? g : 0];
    h += '<h3>' + (s.st === 'sim' ? esc('Entreno simulado: ' + mName) : sp([esc(s.kind === 'week' ? TITLE.week : title), esc(mName)], 'd')) +
      ' <span aria-hidden="true">' + s.r.map(function (e) { return medalSVG(e.m); }).join('') + '</span></h3>';
    var tags = s.up.map(function (a) { return '<span class="tag g">+1 ' + esc(attrL(a)) + '</span>'; }).join('');
    if (s.prep) tags += '<span class="tag y">' + esc('Plan listo: +' + s.prep.v + ' en ' + attrL(s.prep.k).toLowerCase() + ' para este partido') + '</span>';
    if (tags) h += '<p class="ct-tags">' + tags + '</p>';
    var seen = {}, prs = [];
    s.d.forEach(function (id) { var a = T().attrOf(id); if (seen[a]) return; seen[a] = 1; prs.push(esc(attrL(a)) + ' ' + (c.tpa ? c.tpa[a] | 0 : 0) + '/100'); });
    h += '<p class="muted">' + sp(prs, 'v') + '</p>';
    var gains = [];
    if (s.dc) gains.push('Confianza ' + (s.dc > 0 ? '+' : '') + s.dc);
    if (s.dch) gains.push('Química ' + (s.dch > 0 ? '+' : '') + s.dch);
    if (gains.length) h += '<p>' + sp(gains, 'v') + '</p>';
    if (hall && s.st === 'done' && g >= 2) h += '<p class="muted">El seis de la próxima jornada lo tiene en cuenta.</p>';
    return h + '</div>';
  }

  // ---------------------------------------------------------------- Jugador › Entreno
  function trainHTML(c, h0) {
    H = h0; css();
    if (!T() || !c || !c.player) return '';
    T().ensure(c);
    var n = c.sesN || [0, 0, 0, 0];
    return '<div class="card"><h3>Entrenos con el club</h3>' + T().TPA_KEYS.map(function (a) {
      var v = c.tpa[a] | 0;
      return '<div class="ct-pr"><span>' + esc(attrL(a)) + '</span>' + bar(v) + '<b>' + v + '/100</b></div>';
    }).join('') +
      '<p>' + sp(['Oro ' + (n[3] | 0), 'Plata ' + (n[2] | 0), 'Bronce ' + (n[1] | 0), 'Simulados ' + (c.sesSim | 0)], 'v') + '</p>' +
      '<p class="muted">La sesión sube el atributo del ejercicio; el enfoque de arriba sigue sumando cada semana aunque no entrenes.</p></div>';
  }

  // ---------------------------------------------------------------- Palmarés › Opciones
  function optsHTML(c, h0) {
    H = h0; css();
    if (!T() || !c) return '';
    T().ensure(c);
    var v = c.sesOpt;
    var b = function (k, t) { return '<button data-act="ct-opt" data-v="' + k + '" aria-pressed="' + (v === k) + '">' + t + '</button>'; };
    return '<div class="ct-opt" role="group" aria-label="Entrenos con el club"><b>Entrenos con el club</b>' + b('full', '2 ejercicios') + b('short', '1 ejercicio') + b('off', 'No') + '</div>' +
      '<p class="muted" style="margin:4px 0 8px">No: sigues progresando con el enfoque de la semana, sin sesión.</p>';
  }

  // ---------------------------------------------------------------- acciones (career-ui.js onClick, prefijo ct-)
  function act(a, b) {
    var t = T(); if (!t) return null;
    switch (a) {
      case 'ct-go': {
        var id = b && b.getAttribute ? b.getAttribute('data-id') : '';
        id = id || t.pending();
        return id ? { go: id } : { render: true, focus: '[data-act="play"]' };
      }
      case 'ct-sim': t.simulate(); return { render: true, focus: '[data-act="play"]' };
      case 'ct-end': t.finish(); return { render: true, focus: '[data-act="play"]' };
      case 'ct-opt': {
        var v = b && b.getAttribute ? b.getAttribute('data-v') : '';
        if (!t.setOpt(v)) return null;
        return { render: true, focus: '[data-act="ct-opt"][data-v="' + v + '"]' };
      }
    }
    return null;
  }

  VB.CareerTrainUI = { card: card, trainHTML: trainHTML, optsHTML: optsHTML, act: act, css: css, _medalSVG: medalSVG };
})();
