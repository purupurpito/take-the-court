/* TAKE THE COURT — js/install.js (owner: ui_main)
 * Tutorial de «instalar» el juego (añadirlo a la pantalla de inicio) para jugar a pantalla completa en el móvil, sin la barra de
 * direcciones. Pasos dibujados según dónde se abre: iPhone/iPad (Safari), Android (Chrome; botón «Instalar» directo si el
 * navegador lo ofrece) y navegadores de dentro de otras apps (WhatsApp, Instagram…), donde lo primero es abrirlo en el navegador.
 *  - Sale UNA vez, sola, la primera vez que se entra desde un móvil sin tenerlo instalado (clave 'make-the-cut.install'), y nunca antes de
 *    acabar el primer partido («Jugar ya», 1.22.0: primero se juega).
 *  - Se cierra al momento: «Ahora no», la ✕, tocando fuera o con Esc. No vuelve a salir sola.
 *  - Se vuelve a abrir con VB.Install.open() (el botón «Pantalla completa» del menú en iPhone y en navegadores de apps).
 * Sin dependencias: crea su propio DOM y su CSS (usa los colores de index.html).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var KEY = 'make-the-cut.install';
  var ua = navigator.userAgent || '';
  var isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  // navegadores de dentro de apps: no instalan ni ponen pantalla completa (y a menudo no giran a horizontal).
  // (25-nov-2026) + «Barcelona N» (Threads), BytedanceWebview (TikTok), WhatsApp (su navegador propio, en pruebas en Android y
  // anunciado para iPhone: si abre en el navegador del sistema el UA no lo dice y no salta) y, en iPhone, cualquier WKWebView sin
  // «Safari/» en el UA (Safari, Chrome, Firefox, Edge y SFSafariViewController lo llevan; la web añadida a inicio no, pero esa es
  // standalone y se descarta abajo).
  var inAppUA = /FBAN|FBAV|FB_IAB|Instagram|Barcelona \d|Line\/|MicroMessenger|Snapchat|musical_ly|TikTok|BytedanceWebview|Twitter|LinkedInApp|GSA\/|WhatsApp|; wv\)/i.test(ua) ||
    (/iP(hone|od|ad)/.test(ua) && !/Safari\//.test(ua));
  // La app de Android (TWA de android/, Chrome de verdad y no WebView: su UA es el de Chrome, sin «; wv)») y la web instalada no
  // son nunca navegador de app: display-mode fullscreen/standalone, navigator.standalone (iPhone) o el referrer que pone la TWA
  // al abrir (android-app://com.takethecourt.app).
  function twa() { try { return /^android-app:\/\/com\.takethecourt\.app/.test(document.referrer || ''); } catch (e) { return false; } }
  var inApp = inAppUA && !standalone() && !twa();
  var deferred = null; // evento beforeinstallprompt (Chrome Android / escritorio)
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; refreshBtn(); });
  window.addEventListener('appinstalled', function () { deferred = null; seen(); close(); });

  function touch() { try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch (e) { return false; } }
  function standalone() {
    try { return navigator.standalone === true || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }
  }
  function wasSeen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function seen() { try { localStorage.setItem(KEY, '1'); } catch (e) { } }

  // ---------------------------------------------------------------- dibujos (SVG en línea, estilo cartoon del juego)
  var INK = '#1d1530', GOLD = '#ffd23f', HOT = '#ff6a2e', PAPER = '#fff6e6', SCR = '#3a2c66';
  function phone(inner) {
    return '<svg viewBox="0 0 120 190" aria-hidden="true"><rect x="14" y="6" width="92" height="178" rx="16" fill="' + INK + '"/>' +
      '<rect x="20" y="14" width="80" height="162" rx="10" fill="' + SCR + '"/>' + inner + '</svg>';
  }
  function ring(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + GOLD + '" stroke-width="3.5" class="ix-pulse"/>'; }
  function finger(x, y) { // dedo que toca (la punta en x,y)
    // la punta queda justo debajo del objetivo (que se siga viendo) y la mano baja desde ahí
    return '<g transform="translate(' + (x + 6) + ' ' + (y + 11) + ') scale(.78)"><g class="ix-tap"><path d="M0 0c-3 0-5 2-5 5v16c-3-3-8-3-9 1 0 2 1 3 2 5l8 10c2 2 4 3 7 3h8c5 0 8-4 8-9V17c0-3-2-5-5-5-1 0-2 0-3 1 0-3-2-4-4-4-2 0-3 1-3 2V5c0-3-2-5-4-5z" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/></g></g>';
  }
  function shareIco(x, y, c) { // cuadrado con flecha hacia arriba (Compartir de iOS)
    return '<g transform="translate(' + x + ' ' + y + ')" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M-5 -1h-2v10h14V-1h-2"/><path d="M0 4V-9M-4 -5l4-4 4 4"/></g>';
  }
  function plusIco(x, y, c) { return '<g transform="translate(' + x + ' ' + y + ')" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round"><rect x="-6" y="-6" width="12" height="12" rx="3"/><path d="M0 -3v6M-3 0h6"/></g>'; }
  function ball(x, y, r) { // el icono del juego, en pequeño
    return '<g transform="translate(' + x + ' ' + y + ')"><rect x="' + (-r - 3) + '" y="' + (-r - 3) + '" width="' + (2 * r + 6) + '" height="' + (2 * r + 6) + '" rx="' + (r * 0.55) + '" fill="#2a1f4a" stroke="' + INK + '" stroke-width="1.5"/>' +
      '<circle r="' + r + '" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<g fill="none" stroke="' + INK + '" stroke-width="1.3" transform="scale(' + (r / 10) + ') translate(-12 -12)">' +
      ['0', '120', '240'].map(function (a) { return '<g transform="rotate(' + a + ' 12 12)"><path d="M12 12C12 8 10.5 4.5 8 2.8"/><path d="M13.8 2.2C16.5 5.5 17.8 9.5 17.3 13.8"/></g>'; }).join('') + '</g></g>';
  }
  function rows(hl, label, ico) { // lista de opciones de un menú; la fila hl resaltada con su texto
    var h = '';
    for (var i = 0; i < 5; i++) {
      var y = 70 + i * 19, on = i === hl;
      h += '<rect x="26" y="' + y + '" width="68" height="15" rx="4" fill="' + (on ? GOLD : 'rgba(255,255,255,.12)') + '"/>';
      if (on) h += (ico ? ico(34, y + 7.5, INK) : '') + '<text x="' + (ico ? 43 : 31) + '" y="' + (y + 10.5) + '" font-size="6.2" font-weight="800" fill="' + INK + '" font-family="Barlow,system-ui,sans-serif">' + label + '</text>';
      else h += '<rect x="32" y="' + (y + 6) + '" width="' + (30 + (i * 7) % 20) + '" height="3" rx="1.5" fill="rgba(255,255,255,.35)"/>';
    }
    return h;
  }
  function homeGrid() {
    var h = '';
    for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) {
      if (r === 2 && c === 1) continue;
      h += '<rect x="' + (31 + c * 22) + '" y="' + (40 + r * 26) + '" width="14" height="14" rx="4" fill="rgba(255,255,255,' + (0.14 + ((r + c) % 3) * 0.06) + ')"/>';
    }
    return h + ball(60, 99, 7);
  }
  var DRAW = {
    iosShare: phone('<rect x="24" y="128" width="72" height="22" rx="11" fill="#2b2547" stroke="rgba(255,255,255,.18)"/>' +
      '<rect x="30" y="135" width="10" height="8" rx="2" fill="rgba(255,255,255,.3)"/><rect x="80" y="135" width="10" height="8" rx="2" fill="rgba(255,255,255,.3)"/>' +
      shareIco(60, 140, PAPER) + ring(60, 139, 11) + finger(60, 148)),
    iosAdd: phone('<rect x="20" y="58" width="80" height="118" rx="10" fill="#2b2547"/>' + rows(2, 'Añadir a inicio', plusIco) + finger(86, 116)),
    iosConfirm: phone('<rect x="20" y="14" width="80" height="40" rx="10" fill="#2b2547"/><text x="82" y="32" font-size="8" font-weight="800" fill="' + GOLD + '" text-anchor="end" font-family="Barlow,system-ui,sans-serif">Añadir</text>' +
      ring(72, 29, 13) + ball(40, 80, 9) + '<rect x="56" y="76" width="34" height="5" rx="2.5" fill="rgba(255,255,255,.4)"/>' + finger(72, 40)),
    home: phone(homeGrid() + ring(60, 99, 13) + finger(60, 110)),
    andMenu: phone('<rect x="20" y="14" width="80" height="22" fill="#2b2547"/><rect x="26" y="20" width="54" height="10" rx="5" fill="rgba(255,255,255,.18)"/>' +
      '<g fill="' + PAPER + '"><circle cx="90" cy="20" r="1.8"/><circle cx="90" cy="25" r="1.8"/><circle cx="90" cy="30" r="1.8"/></g>' + ring(90, 25, 9) + finger(88, 33)),
    andInstall: phone('<rect x="20" y="58" width="80" height="118" rx="10" fill="#2b2547"/>' + rows(3, 'Instalar aplicación', plusIco) + finger(86, 135)),
    appMenu: phone('<rect x="20" y="14" width="80" height="22" fill="#2b2547"/><g fill="' + PAPER + '"><circle cx="84" cy="25" r="1.8"/><circle cx="89" cy="25" r="1.8"/><circle cx="94" cy="25" r="1.8"/></g>' +
      ring(89, 25, 10) + finger(87, 34)),
    appOpen: phone('<rect x="20" y="58" width="80" height="118" rx="10" fill="#2b2547"/>' + rows(1, 'Abrir en el navegador', null) + finger(86, 97))
  };

  // ---------------------------------------------------------------- pasos según el sitio
  function steps() {
    if (inApp) return {
      intro: 'Lo estás abriendo dentro de otra app (WhatsApp, Instagram…). Ahí no se puede quitar la barra: ábrelo en el navegador y luego instálalo.',
      s: [['appMenu', 'Toca el menú de la app (los tres puntos <b>•••</b> o <b>⋮</b>).'],
        ['appOpen', 'Elige <b>Abrir en el navegador</b> (Safari o Chrome).'],
        [isIOS ? 'iosShare' : 'andMenu', 'Ya en el navegador, sigue los pasos de instalar: vuelve a abrir este tutorial desde <b>Pantalla completa</b>.']]
    };
    if (isIOS) return {
      intro: 'En iPhone el juego solo va a pantalla completa si lo añades a la pantalla de inicio. Es un minuto y luego se abre como una app.',
      s: [['iosShare', 'En Safari, toca <b>Compartir</b> (el cuadrado con la flecha). Si no lo ves, está dentro del botón <b>•••</b>.'],
        ['iosAdd', 'Baja y toca <b>Añadir a pantalla de inicio</b>.'],
        ['iosConfirm', 'Toca <b>Añadir</b>, arriba a la derecha.'],
        ['home', 'Abre <b>Take the Court</b> desde su icono: a pantalla completa y sin barra.']]
    };
    return {
      intro: 'Instala el juego y se abrirá como una app: a pantalla completa, sin la barra de direcciones.',
      s: [['andMenu', 'En Chrome, toca el menú <b>⋮</b> de arriba a la derecha.'],
        ['andInstall', 'Toca <b>Instalar aplicación</b> (o <b>Añadir a pantalla de inicio</b>).'],
        ['home', 'Abre <b>Take the Court</b> desde su icono.']]
    };
  }

  // ---------------------------------------------------------------- panel
  // SPLAT (17-nov-2026, notes/splat.md «Instalar»): hoja de pegatina (.sp-panel) sobre el partido con un tinte leve (sin velo oscuro);
  // cada paso, una pegatina de papel crema con su número en sello dorado; «Ahora no» y «Entendido / Instalar» = manchas de pintura.
  // La ✕ va fuera de la hoja y la fila de botones se queda pegada abajo: con poco alto la hoja se desplaza sin que se vayan.
  var P = ':root:not(#_):not(#_):not(#_) ', PP = ':root.ph' + P.slice(5);   // (PP: móvil, html.ph)
  function isPh() { return !!(VB.Splat && VB.Splat.phone && VB.Splat.phone()); }
  var CSS = [
    '#install{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:calc(14px + var(--st,0px)) calc(14px + var(--sr,0px)) calc(14px + var(--sbm,0px)) calc(14px + var(--sl,0px));',
    'background:rgba(21,16,42,.34);font-family:var(--sp-ui,system-ui,sans-serif)}',
    '#install[hidden]{display:none}',
    '#install .ix-wrap{position:relative;display:flex;width:min(780px,100%);max-height:100%;min-height:0}',
    '#install .ix-sheet{flex:1 1 auto;min-width:0;max-height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:18px 22px 16px;text-align:left;',
    'scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.5) transparent}',
    P + '#install .ix-sheet{border-radius:18px 24px 20px 26px/22px 18px 26px 20px;background:#1b1534}',
    P + '#install .ix-k{margin:0 0 4px}',
    P + '#install h2.sp-h{--sp-hs:clamp(22px,5vh,34px);margin:0 54px 10px 0;white-space:normal;line-height:1.02}',
    '#install .ix-intro{margin:0 0 14px;font:500 14px/1.45 var(--sp-ui);color:rgba(255,244,220,.9)}',
    '#install .ix-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px 14px;margin:0;padding:4px 6px 6px 2px;list-style:none}',
    '#install .ix-steps li{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 10px 12px;border-radius:14px 18px 12px 16px/16px 12px 18px 14px;',
    'background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 3px #000,4px 5px 0 3px #000}',
    '#install .ix-steps li:nth-child(odd){transform:rotate(-.8deg)}#install .ix-steps li:nth-child(even){transform:rotate(.7deg)}',
    '#install .ix-steps svg{width:100%;max-width:112px;height:auto;max-height:32vh}',
    '#install .ix-n{position:absolute;left:-8px;top:-10px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--sp-gold);color:var(--sp-ink);',
    'font:400 16px/1 var(--sp-pop);box-shadow:0 0 0 3px var(--sp-ink),2px 3px 0 3px var(--sp-ink);transform:rotate(-10deg)}',
    '#install .ix-steps p{margin:0;font:600 13px/1.38 var(--sp-ui);text-align:center;color:var(--sp-ink)}',
    '#install .ix-steps b{color:var(--sp-ink);background:linear-gradient(transparent 55%,rgba(255,203,61,.75) 55%)}',
    '#install .ix-acts{position:sticky;bottom:-16px;z-index:2;display:flex;flex-wrap:wrap;gap:12px 14px;justify-content:flex-end;align-items:center;margin:10px -22px -16px;padding:12px 22px 16px;',
    'background:linear-gradient(rgba(27,21,52,0),#1b1534 26%)}',
    P + '#install .ix-acts .sp-btn{--sp-h:48px;--sp-fs:clamp(12px,2.2vh,15px)}',
    P + '#install .ix-x{position:absolute;top:-12px;right:-12px;z-index:3;--sp-h:46px;--sp-px:0;width:46px}',
    '#install .ix-x svg:not(.sp-blob){width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:3.6;stroke-linecap:round}',
    '#install .ix-pulse{transform-box:fill-box;transform-origin:center;animation:inPulse 1.4s ease-in-out infinite}',
    '#install .ix-tap{animation:inTap 1.4s ease-in-out infinite}',
    '@keyframes inPulse{50%{transform:scale(1.18);opacity:.55}}',
    '@keyframes inTap{50%{transform:translateY(4px)}}',
    // poco alto sin ser el móvil apaisado (ventana baja de PC): lo de antes, solo con :root:not(.ph)
    '@media (max-height:460px){:root:not(.ph) #install .ix-sheet{padding:12px 16px 12px}' + P + '#install h2.sp-h{--sp-hs:22px;margin-bottom:6px}',
    ':root:not(.ph) #install .ix-intro{font-size:12.5px;line-height:1.38;margin-bottom:10px}:root:not(.ph) #install .ix-steps{gap:12px 12px}:root:not(.ph) #install .ix-steps li{padding:9px 8px 9px;gap:5px}',
    ':root:not(.ph) #install .ix-steps svg{max-height:34vh;max-width:92px}:root:not(.ph) #install .ix-steps p{font-size:12px;line-height:1.3}:root:not(.ph) #install .ix-n{width:28px;height:28px;font-size:14px}',
    ':root:not(.ph) #install .ix-acts{margin:8px -16px -12px;padding:8px 16px 12px;bottom:-12px}' + P + '#install .ix-acts .sp-btn{--sp-h:44px}}',
    // — móvil (.ph) — (18-nov-2026, spec «Instalar»): un paso cada vez. Dibujo a la izquierda (40 %, ≤ 180 px de alto), número en sello de
    // 40 px y la instrucción a 17-18 px (palabras clave en dorado); puntitos y «Siguiente ›» abajo a la derecha (en el último, «Entendido»);
    // también se pasa de paso deslizando un dedo. Título «Pantalla completa», sin rótulo ni «Ahora no». Tinte del 20 %.
    PP + '#install{padding:var(--ph-gt) var(--ph-g) var(--ph-gb);background:rgba(21,16,42,.2)}',
    PP + '#install .ix-wrap{width:min(640px,100%);height:auto;max-height:calc(100vh - var(--ph-gt) - var(--ph-gb))}' + PP + '#install .ix-sheet{max-height:calc(100vh - var(--ph-gt) - var(--ph-gb))}',
    PP + '#install .ix-sheet{display:flex;flex-direction:column;padding:12px 18px 0;overflow-y:auto}',
    PP + '#install .ix-k{display:none}',
    PP + '#install h2.sp-h{--sp-hs:var(--ph-title);margin:0 48px 4px 0;padding:0;line-height:1.05;white-space:nowrap}' + PP + '#install .ix-sheet{padding-top:16px}',
    PP + '#install .ix-intro{margin:0 40px 8px 0;font-size:var(--ph-body);line-height:1.4}',
    PP + '#install .ix-steps{display:block;flex:1 1 auto;min-height:0;padding:6px 4px 4px 6px;touch-action:pan-y}',
    PP + '#install .ix-steps li{display:none;flex-direction:row;align-items:center;gap:16px;min-height:0;padding:12px 16px 12px 12px;transform:rotate(-.6deg)}',
    PP + '#install .ix-steps li.on{display:flex}',
    PP + '#install .ix-steps svg{flex:none;width:auto;max-width:40%;height:180px;max-height:min(180px,calc(100vh - 200px))}',
    PP + '#install.ix-p1 .ix-steps svg{max-height:min(180px,calc(100vh - 256px))}',
    PP + '#install .ix-n{position:static;flex:none;width:40px;height:40px;font-size:20px}',
    PP + '#install .ix-tx{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-width:0}',
    PP + '#install .ix-steps p{font:600 clamp(17px,15.4px + .29vw,18px)/1.35 var(--sp-ui);text-align:left;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}',
    PP + '#install .ix-steps b{background:none;color:#b8400f}',
    PP + '#install .ix-acts{position:static;flex:none;flex-wrap:nowrap;align-items:center;margin:8px -18px 0;padding:6px 18px 12px;background:none}',
    PP + '#install .ix-acts .sp-btn{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:24px}',
    PP + '#install .ix-acts [data-in="later"]{display:none}',
    PP + '#install .ix-dots{display:flex;align-items:center;gap:8px;margin-right:auto}',
    PP + '#install .ix-dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,244,220,.4);box-shadow:0 0 0 2px var(--sp-ink)}',
    PP + '#install .ix-dots i.on{width:24px;border-radius:6px;background:var(--sp-gold)}',
    PP + '#install .ix-x{top:-4px;right:-6px}',
    P + '#install .ix-dots,' + P + '#install [data-in="next"]{display:none}',
    PP + '#install .ix-dots{display:flex}',
    PP + '#install.ix-more [data-in="next"]{display:inline-flex}' + PP + '#install.ix-more #inOk{display:none}',
    '@media (max-width:460px){#install .ix-steps{grid-template-columns:repeat(2,minmax(0,1fr))}' + P + '#install h2.sp-h{--sp-hs:clamp(22px,7.4vw,30px)}#install .ix-steps svg{max-width:80px}}',
    '.rm #install .ix-pulse,.rm #install .ix-tap{animation:none}',
    '@media (prefers-reduced-motion:reduce){#install .ix-pulse,#install .ix-tap{animation:none}}'
  ].join('');
  var root = null, lastFocus = null, step = 0;
  function build() {
    if (root) return root;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'install'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'inTitle');
    root.addEventListener('click', function (e) { if (e.target === root) close(); e.stopPropagation(); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
    // (móvil) un dedo deslizando de lado pasa de paso (nunca dos dedos)
    var sx = null, sy = 0;
    root.addEventListener('touchstart', function (e) { if (e.touches.length === 1 && isPh()) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null; }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (sx == null) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(step + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.body.appendChild(root);
    return root;
  }
  function render() {
    var d = steps();
    // (SPLAT) hoja .sp-panel; la ✕ (pegatina crema) fuera de la hoja; botones = manchas de pintura (js/splat.js las dibuja con decorate)
    root.innerHTML = '<div class="ix-wrap"><div class="ix-sheet sp-panel">' +
      '<p class="ix-k sp-k">Para jugar mejor</p><h2 class="sp-h" id="inTitle">Juega a pantalla completa</h2><p class="ix-intro">' + d.intro + '</p>' +
      '<ol class="ix-steps">' + d.s.map(function (s, i) {
        return '<li><span class="ix-n">' + (i + 1) + '</span>' + DRAW[s[0]] + '<p>' + s[1] + '</p></li>';
      }).join('') + '</ol>' +
      '<div class="ix-acts"><span class="ix-dots" aria-hidden="true">' + d.s.map(function () { return '<i></i>'; }).join('') + '</span>' +
      '<button class="sp-btn sp-cream sp-sm" data-shape="2" data-in="later"><span class="sp-t">Ahora no</span></button>' +
      '<button class="sp-btn sp-kit pri" data-shape="1" data-in="next"><span class="sp-t">Siguiente ›</span></button>' +
      '<button class="sp-btn sp-kit pri" data-shape="3" data-in="ok" id="inOk"><span class="sp-t">Entendido</span></button></div></div>' +
      '<button class="ix-x sp-btn sp-cream sp-sq" data-shape="1" data-in="close" aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(root); } catch (e) { } }
    root.querySelectorAll('[data-in]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var a = b.getAttribute('data-in');
        if (a === 'next') { go(step + 1); return; }
        if (a === 'install' && deferred) { var p = deferred; deferred = null; p.prompt(); p.userChoice.then(function () { close(); }, close); return; }
        close();
      });
    });
    // (móvil: título corto; el número y el texto, juntos a la derecha del dibujo)
    if (isPh()) {
      var h2 = root.querySelector('#inTitle'); if (h2) h2.textContent = 'Pantalla completa';
      Array.prototype.forEach.call(root.querySelectorAll('.ix-steps li'), function (li) { var n = li.querySelector('.ix-n'), p = li.querySelector('p'), w = document.createElement('div'); w.className = 'ix-tx'; li.appendChild(w); w.appendChild(n); w.appendChild(p); });
    }
    go(step);
    refreshBtn();
  }
  /** Móvil: enseña el paso i (puntitos, «Siguiente ›» o, en el último, «Entendido» / «Instalar»; la frase de entrada solo en el primero). */
  function go(i) {
    if (!root) return;
    var L = root.querySelectorAll('.ix-steps li'), D = root.querySelectorAll('.ix-dots i'), n = L.length; if (!n) return;
    var prev = step; step = Math.max(0, Math.min(n - 1, i | 0));
    for (var k = 0; k < n; k++) { L[k].classList.toggle('on', k === step); if (D[k]) D[k].classList.toggle('on', k === step); }
    root.classList.toggle('ix-more', step < n - 1); root.classList.toggle('ix-p1', step === 0);
    var it = root.querySelector('.ix-intro'); if (it) it.hidden = isPh() && step > 0;
    if (isPh() && prev !== step) {
      var f = root.querySelector(step < n - 1 ? '[data-in="next"]' : '#inOk'), a = document.activeElement;
      if (f && a && root.contains(a) && a.getAttribute('data-in') !== 'close') { try { f.focus({ preventScroll: true }); } catch (e) { } }
    }
  }
  // con el aviso nativo de Chrome disponible, «Entendido» pasa a «Instalar» (un toque y listo)
  function refreshBtn() {
    var b = root && root.querySelector('#inOk'); if (!b) return;
    if (deferred && !inApp) { var t = b.querySelector('.sp-t') || b; t.textContent = 'Instalar'; b.setAttribute('data-in', 'install'); }
  }
  function open() {
    build(); step = 0; render();
    lastFocus = document.activeElement;
    root.hidden = false; seen();
    try { root.querySelector(isPh() && root.classList.contains('ix-more') ? '[data-in="next"]' : '#inOk').focus({ preventScroll: true }); } catch (e) { }
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) { }
  }
  function isOpen() { return !!(root && !root.hidden); }
  /** ¿Tiene sentido ofrecerlo aquí? (móvil o tableta sin el juego instalado) */
  function useful() { return touch() && !standalone(); }

  // Primera visita desde el móvil: sale sola una vez, cuando ya se ve el menú y después del primer partido (ver played). Nunca en las pruebas (?debug=…) ni instalada.
  // Nunca a la vez que otro panel (p. ej. «Primer partido», que sale al tocar JUGAR la primera vez): espera a que la portada del
  // menú esté libre (VB.UI.menuIdle: sin panel, sin cortinilla, sin Carrera) 1,5 s seguidos. Si el jugador se va a jugar antes,
  // sale al volver al menú tras el partido; si cierra la página antes, en la próxima visita (no se marca como visto).
  // «Jugar ya» (1.22.0, informe 4.3): quien no ha jugado nunca un partido (récord 'make-the-cut.record' a 0 o sin él) va primero a jugar;
  // el aviso espera a que haya acabado su primer partido (sale al volver al menú, como siempre). Lo de antes de jugar no cuenta.
  // (22-nov-2026: también con anyMatch, que sube con cualquier partido —6v6, cortos, online…—, o con partidos en el perfil; antes solo
  // record.played, el récord del 2v2 largo, y a quien solo jugaba 6v6 nunca le salía el aviso)
  function played() {
    try { var r = JSON.parse(localStorage.getItem('make-the-cut.record') || 'null'); if (r && (r.played > 0 || r.anyMatch > 0)) return true; } catch (e) { return true; }
    try { var P = window.VB && window.VB.Profile; return !!(P && P.stats && P.stats().m > 0); } catch (e) { return false; }
  }
  function idle() {
    var c = VB.ctx, U = VB.UI;
    if (!played()) return false;
    if (c && c.state && c.state !== 'menu') return false;
    if (U && U.menuIdle) { try { if (!U.menuIdle()) return false; } catch (e) { return false; } }
    else if (U && U.isPanelOpen && U.isPanelOpen()) return false;
    if (VB.CareerUI && VB.CareerUI.isOpen) { try { if (VB.CareerUI.isOpen()) return false; } catch (e) { } }
    if (escOpen()) return false;
    return document.visibilityState !== 'hidden';
  }
  function auto() {
    var q = location.search || '';
    if (/[?&](debug|autopilot|noinstall)\b/.test(q) || wasSeen() || !useful()) return;
    var t0 = Date.now(), calm = 0;
    var iv = setInterval(function () {
      if (wasSeen() || isOpen()) { clearInterval(iv); return; }        // abierto a mano (Pantalla completa) o ya visto
      calm = idle() ? calm + 250 : 0;
      if (Date.now() - t0 >= 2200 && calm >= 1500) { clearInterval(iv); open(); }
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  document.addEventListener('vb:ph', function () { if (isOpen()) render(); });   // (girar / cambiar de tamaño con el aviso abierto)

  // ================================================================ «Ábrelo en el navegador» (25-nov-2026, Ferran)
  // Quien abre el enlace desde Instagram, TikTok, Facebook, WhatsApp… se quedaba atascado en «Gira el móvil» (esos navegadores
  // a menudo no giran a horizontal, ni dan pantalla completa ni instalan) y creía que el juego no iba. Al arrancar en un
  // navegador de app sale ESTA hoja (no bloquea: «Seguir aquí igualmente», que se recuerda) con «Abrir en el navegador», los dos
  // pasos dibujados de la app que dice el UA y «Copiar enlace». Si luego se queda en «Gira el móvil» ~4 s, #rotate la vuelve a ofrecer.
  //
  // Qué abre «Abrir en el navegador» (comprobado en la tabla de github.com/shalanah/inapp-debugger: Android actualizada el
  // 7-nov-2024, iPhone el 7-mar-2026; no hay forma de que Apple lo permita «oficialmente» y nada de esto está documentado por las apps):
  //  - Android: intent de Chrome  intent://<host><ruta+query>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=…;end
  //    Funciona en Instagram, Facebook, Messenger y Threads (✅ en la tabla), Telegram y LINE; en TikTok «no es fiable» y en WeChat
  //    no va. Si no hay Chrome, la app carga la dirección de reserva (la misma con ttc_ia=nochrome) dentro de sí misma: al volver a
  //    arrancar con esa marca el botón pide el intent SIN package (el sistema abre el navegador por defecto o deja elegir).
  //    Automático (sin toque) solo en Instagram, Facebook, Messenger y Threads, que lo atienden ellas, y una vez cada 10 min
  //    (si el intent no saliera, la dirección de reserva no puede dar un bucle). En las demás, solo al tocar: un WebView que no
  //    conozca intent:// enseña una página de error (con el toque, al menos, el jugador sabe qué ha pasado y vuelve atrás).
  //  - iPhone/iPad (siempre con el toque del jugador):
  //    · Instagram: x-safari-https ❌; sí va  instagram://extbrowser/?url=<url codificada>  (abre el navegador por defecto).
  //    · Facebook y Threads: x-safari-https:// ✅ solo con window.open.  · Messenger, LinkedIn, LINE, Telegram, app de Google: ✅.
  //    · TikTok, X, Snapchat, WeChat: ❌ todo: sin botón de abrir; los pasos dibujados y «Copiar enlace» pasan a ser lo principal.
  //    · WebView desconocido (p. ej. WhatsApp si estrena su navegador): se intenta x-safari-https:// al tocar y quedan los pasos.
  //  Sin red ni móvil de verdad no se puede comprobar aquí; tools/inapptest.js comprueba la detección y los enlaces generados.
  var STAY = 'make-the-cut.inapp', TRY = 'make-the-cut.inapp.try';
  function appOf(u) {
    if (/Instagram/i.test(u)) return 'ig';
    if (/Messenger|FB_IAB\/MESSENGER|FBAN\/Messenger/i.test(u)) return 'ms';
    if (/FBAN|FBAV|FB_IAB/i.test(u)) return 'fb';
    if (/Barcelona \d/.test(u)) return 'th';
    if (/musical_ly|TikTok|BytedanceWebview/i.test(u)) return 'tt';
    if (/WhatsApp/i.test(u)) return 'wa';
    if (/Snapchat/i.test(u)) return 'sc';
    if (/Twitter/i.test(u)) return 'tw';
    if (/LinkedInApp/i.test(u)) return 'li';
    if (/Line\//.test(u)) return 'ln';
    if (/MicroMessenger/i.test(u)) return 'wc';
    if (/GSA\//.test(u)) return 'gsa';
    if (/Telegram/i.test(u)) return 'tg';
    return '';
  }
  var APP_NAME = { ig: 'Instagram', ms: 'Messenger', fb: 'Facebook', th: 'Threads', tt: 'TikTok', wa: 'WhatsApp', sc: 'Snapchat', tw: 'X',
    li: 'LinkedIn', ln: 'LINE', wc: 'WeChat', gsa: 'la app de Google', tg: 'Telegram' };
  var app = appOf(ua);
  var AUTO_AND = { ig: 1, fb: 1, ms: 1, th: 1 };          // Android: el intent automático solo donde se sabe que va
  var IOS_NONE = { tt: 1, tw: 1, sc: 1, wc: 1 };          // iPhone: ningún esquema funciona
  var IOS_WOPEN = { fb: 1, th: 1 };                       // iPhone: x-safari-https solo con window.open
  // marca en la dirección (la pone la dirección de reserva del intent): 'nochrome' = el intent con Chrome no salió
  var mark = (function () { var m = /[?&]ttc_ia=([a-z]+)/.exec(location.search || ''); return m ? m[1] : ''; })();
  if (mark) { try { history.replaceState(history.state, '', location.pathname + (location.search.replace(/([?&])ttc_ia=[a-z]+&?/, '$1').replace(/[?&]$/, '')) + location.hash); } catch (e) { } }

  /** Dirección pública de esta misma página (ruta, query y #; sin la marca). En file:// (pruebas) o sin host, takethecourt.com/. */
  function pageUrl(extra) {
    var web = /^https?:$/.test(location.protocol) && location.host;
    var q = (location.search || '').replace(/([?&])ttc_ia=[a-z]+&?/, '$1').replace(/[?&]$/, '');
    if (extra) q += (q ? '&' : '?') + extra;
    return 'https://' + (web ? location.host + location.pathname : 'takethecourt.com/') + q + (location.hash || '');
  }
  /** Enlaces para salir del navegador de la app: {https, intent, intentAny, safari, ig, method}. method = 'intent' | 'intentAny' |
   *  'ig' | 'safariWin' | 'safari' | '' (nada que funcione: solo pasos y copiar). */
  function links() {
    var https = pageUrl(), rest = https.replace(/^https:\/\//, '');
    var L = {
      https: https,
      intent: 'intent://' + rest + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(pageUrl('ttc_ia=nochrome')) + ';end',
      intentAny: 'intent://' + rest + '#Intent;scheme=https;S.browser_fallback_url=' + encodeURIComponent(pageUrl('ttc_ia=fail')) + ';end',
      safari: 'x-safari-' + https,
      ig: 'instagram://extbrowser/?url=' + encodeURIComponent(https),
      method: ''
    };
    if (isIOS) L.method = IOS_NONE[app] ? '' : app === 'ig' ? 'ig' : IOS_WOPEN[app] ? 'safariWin' : 'safari';
    else if (isAndroid) L.method = app === 'wc' ? '' : (mark === 'nochrome' || mark === 'fail') ? 'intentAny' : 'intent';
    return L;
  }
  // pruebas (tools/inapptest.js): window.__vbNavSpy recoge las direcciones en vez de navegar
  function nav(u, win) {
    if (typeof window.__vbNavSpy === 'function') { window.__vbNavSpy(u, !!win); return; }
    if (win) { var w = null; try { w = window.open(u, '_blank'); } catch (e) { } if (w) return; }
    location.href = u;
  }
  function stayed() { try { return localStorage.getItem(STAY) === '1'; } catch (e) { return false; } }

  var ESC_CSS = [
    '#inappHelp{position:fixed;inset:0;z-index:210;display:flex;align-items:center;justify-content:center;padding:calc(12px + var(--st,0px)) calc(16px + var(--sr,0px)) calc(12px + var(--sbm,0px)) calc(16px + var(--sl,0px));',
    'background:rgba(21,16,42,.55);font-family:var(--sp-ui,system-ui,sans-serif)}',
    '#inappHelp[hidden]{display:none}',
    '#inappHelp .ia-sheet{position:relative;width:min(620px,100%);max-height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:16px 18px 14px;text-align:left;',
    'display:grid;grid-template-columns:minmax(0,1fr);gap:10px;scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.5) transparent}',
    P + '#inappHelp .ia-sheet{border-radius:18px 24px 20px 26px/22px 18px 26px 20px;background:#1b1534}',
    P + '#inappHelp .ia-k{margin:0;font-size:14px}',
    P + '#inappHelp h2.sp-h{--sp-hs:clamp(24px,7vw,34px);margin:0;white-space:normal;line-height:1.02}',
    '#inappHelp .ia-intro{margin:0;font:500 15px/1.4 var(--sp-ui);color:rgba(255,244,220,.92)}',
    '#inappHelp .ia-intro b{color:var(--sp-gold)}',
    '#inappHelp .ia-go{display:flex;flex-wrap:wrap;gap:20px 14px;align-items:center;margin:4px 0 0}',
    P + '#inappHelp .ia-go .sp-btn{--sp-h:54px;--sp-fs:16px;--sp-px:22px;flex:1 1 auto}',
    P + '#inappHelp .ia-go .ia-open{--sp-h:60px;--sp-fs:18px;flex:1 1 100%}',
    '#inappHelp .ia-msg{margin:0;min-height:0;font:600 14px/1.35 var(--sp-ui);color:var(--sp-gold)}',
    '#inappHelp .ia-msg:empty{display:none}',
    '#inappHelp .ia-or{margin:2px 0 0;font:700 14px/1.3 var(--sp-ui);color:rgba(255,244,220,.85)}',
    '#inappHelp .ia-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 12px;margin:0;padding:6px 6px 6px 8px;list-style:none}',
    '#inappHelp .ia-steps li{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 8px 10px;border-radius:14px 18px 12px 16px/16px 12px 18px 14px;',
    'background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 3px #000,4px 5px 0 3px #000}',
    '#inappHelp .ia-steps li:nth-child(odd){transform:rotate(-.8deg)}#inappHelp .ia-steps li:nth-child(even){transform:rotate(.7deg)}',
    '#inappHelp.ia-hl .ia-steps li{animation:iaHl 1s ease-in-out 2}@keyframes iaHl{50%{box-shadow:0 0 0 3px #000,4px 5px 0 3px #000,0 0 0 9px var(--sp-gold)}}',
    '#inappHelp .ia-steps svg{width:100%;max-width:96px;height:auto;max-height:24vh}',
    '#inappHelp .ia-n{position:absolute;left:-8px;top:-10px;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--sp-gold);color:var(--sp-ink);',
    'font:400 16px/1 var(--sp-pop);box-shadow:0 0 0 3px var(--sp-ink),2px 3px 0 3px var(--sp-ink);transform:rotate(-10deg)}',
    '#inappHelp .ia-steps p{margin:0;font:600 14px/1.35 var(--sp-ui);text-align:center;color:var(--sp-ink)}',
    '#inappHelp .ia-steps b{color:var(--sp-ink);background:linear-gradient(transparent 55%,rgba(255,203,61,.75) 55%)}',
    '#inappHelp .ia-acts{display:flex;justify-content:flex-end;margin:2px 0 0}',
    P + '#inappHelp .ia-acts .sp-btn{--sp-h:48px;--sp-fs:15px;--sp-px:18px}' + P + '#inappHelp .ia-acts .sp-t{white-space:nowrap}',
    '#inappHelp .ia-url{width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border-radius:10px;border:2px solid var(--sp-ink);background:var(--sp-cream);color:var(--sp-ink);font:600 14px/1.3 var(--sp-ui)}',
    '#inappHelp .ia-url[hidden]{display:none}',
    '#inappHelp .ix-pulse{transform-box:fill-box;transform-origin:center;animation:inPulse 1.4s ease-in-out infinite}#inappHelp .ix-tap{animation:inTap 1.4s ease-in-out infinite}',
    // apaisado bajo (568x320…): dos columnas; a la izquierda título, frase y botones; a la derecha «Seguir aquí» (arriba) y los pasos
    '@media (orientation:landscape) and (max-height:500px){#inappHelp{padding-top:calc(8px + var(--st,0px));padding-bottom:calc(8px + var(--sbm,0px))}',
    '#inappHelp .ia-sheet{width:min(780px,100%);grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:18px;row-gap:8px;padding:12px 16px 12px;align-items:start;',
    'grid-template-areas:"h acts" "intro or" "intro steps" "go steps" "msg steps" "url steps";grid-template-rows:auto auto auto auto auto 1fr}',
    P + '#inappHelp .ia-k{display:none}' + P + '#inappHelp h2.sp-h{grid-area:h;--sp-hs:clamp(20px,6.6vh,28px)}#inappHelp .ia-intro{grid-area:intro;font-size:14px;line-height:1.35}',
    '#inappHelp .ia-go{grid-area:go;gap:18px}#inappHelp .ia-msg{grid-area:msg}#inappHelp .ia-url{grid-area:url}#inappHelp .ia-or{grid-area:or;margin:0}',
    '#inappHelp .ia-steps{grid-area:steps;gap:10px;padding-top:8px}#inappHelp .ia-steps li{padding:8px 6px}#inappHelp .ia-steps svg{max-height:19vh;max-width:64px}#inappHelp .ia-ig{display:none}',
    '#inappHelp .ia-acts{grid-area:acts;justify-content:flex-end;align-self:start;margin:0 0 6px}',
    P + '#inappHelp .ia-go .sp-btn{--sp-h:44px;--sp-fs:14px}' + P + '#inappHelp .ia-go .ia-open{--sp-h:50px;--sp-fs:15px}' + P + '#inappHelp .ia-acts .sp-btn{--sp-h:44px;--sp-fs:15px}}',
    P + '#inappHelp .ia-go .ia-open .sp-t{white-space:nowrap}',
    // ayuda dentro de «Gira el móvil» (#rotate), a los ~4 s
    '#rotate .rot-help{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:8px;max-width:min(88vw,360px)}',
    '#rotate .rot-help[hidden]{display:none}',
    '#rotate .rot-help .rh-t{margin:0;font:700 16px/1.3 var(--sp-ui,system-ui);color:var(--sp-gold,#ffd23f);text-shadow:0 1px 0 #15102a,0 0 6px #15102a}',
    '#rotate .rot-help .rh-s{margin:0;font:500 14px/1.4 var(--sp-ui,system-ui);color:rgba(255,244,220,.95);text-shadow:0 1px 0 #15102a,0 0 6px #15102a}',
    '#rotate .rot-help .rh-s strong{color:#fff;font-weight:800}',   // (no <b>: #rotate b es el rótulo grande)
    P + '#rotate .rot-help .sp-btn{--sp-h:54px;--sp-fs:16px;--sp-px:22px;pointer-events:auto}',
    '@keyframes inPulse{50%{transform:scale(1.18);opacity:.55}}@keyframes inTap{50%{transform:translateY(4px)}}',
    '.rm #inappHelp .ix-pulse,.rm #inappHelp .ix-tap,.rm #inappHelp.ia-hl .ia-steps li{animation:none}',
    '@media (prefers-reduced-motion:reduce){#inappHelp .ix-pulse,#inappHelp .ix-tap,#inappHelp.ia-hl .ia-steps li{animation:none}}'
  ].join('');
  var escRoot = null, escFocus = null, escTimer = 0, cssDone = false;
  function escCss() {
    if (cssDone) return; cssDone = true;
    var st = document.createElement('style'); st.textContent = ESC_CSS; document.head.appendChild(st);
  }
  function appMenuV() { // menú de tres puntos en vertical (Android)
    return phone('<rect x="20" y="14" width="80" height="22" fill="#2b2547"/><g fill="' + PAPER + '"><circle cx="90" cy="20" r="1.8"/><circle cx="90" cy="25" r="1.8"/><circle cx="90" cy="30" r="1.8"/></g>' +
      ring(90, 25, 9) + finger(88, 33));
  }
  /** Los dos pasos a mano, con los nombres que usa la app (si el UA la dice). */
  function escSteps() {
    var dots = isIOS ? '•••' : '⋮';
    var menu = {
      ig: 'Toca <b>' + dots + '</b> arriba a la derecha.', fb: 'Toca <b>•••</b> arriba a la derecha.', ms: 'Toca <b>•••</b> arriba a la derecha.',
      th: 'Toca <b>•••</b> arriba a la derecha.', tt: 'Toca <b>•••</b> arriba a la derecha (o el botón de compartir).',
      wa: 'Toca <b>' + dots + '</b> arriba a la derecha.'
    }[app] || 'Toca el menú de la app: <b>•••</b>, <b>⋮</b> o el de compartir.';
    var pick = {
      ig: 'Elige <b>Abrir en el navegador externo</b>.', fb: 'Elige <b>Abrir en el navegador externo</b>.', ms: 'Elige <b>Abrir en el navegador externo</b>.'
    }[app] || ('Elige <b>Abrir en el navegador</b>' + (isIOS ? ' (o en Safari).' : isAndroid ? ' (o en Chrome).' : '.'));
    return [[isAndroid ? appMenuV() : DRAW.appMenu, menu], [DRAW.appOpen, pick]];
  }
  function escBuild() {
    if (escRoot) return escRoot;
    escCss();
    escRoot = document.createElement('div'); escRoot.id = 'inappHelp'; escRoot.hidden = true;
    escRoot.setAttribute('role', 'dialog'); escRoot.setAttribute('aria-modal', 'true'); escRoot.setAttribute('aria-labelledby', 'iaTitle');
    escRoot.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stayHere(); } });
    escRoot.addEventListener('click', function (e) { e.stopPropagation(); });
    document.body.appendChild(escRoot);
    return escRoot;
  }
  function escRender() {
    var L = links(), name = APP_NAME[app], where = isIOS ? 'Safari' : 'Chrome';
    var st = escSteps();
    escRoot.innerHTML = '<div class="ia-sheet sp-panel">' +
      '<p class="ia-k sp-k">Para jugar bien</p><h2 class="sp-h" id="iaTitle">Ábrelo en el navegador</h2>' +
      '<p class="ia-intro">Lo estás abriendo dentro de <b>' + (name || 'otra app') + '</b>. Aquí el juego no puede girar a horizontal ni ir a pantalla completa.</p>' +
      '<div class="ia-go">' +
      (L.method ? '<button class="ia-open sp-btn sp-kit pri" data-shape="1" data-ia="open"><span class="sp-t">Abrir en el navegador</span></button>' : '') +
      '<button class="ia-copy sp-btn ' + (L.method ? 'sp-cream' : 'sp-kit pri') + '" data-shape="3" data-ia="copy"><span class="sp-t">Copiar enlace</span></button></div>' +
      '<input class="ia-url" type="url" readonly hidden aria-label="Enlace del juego" value="' + L.https.replace(/"/g, '&quot;') + '">' +
      '<p class="ia-msg" role="status" aria-live="polite"></p>' +
      '<p class="ia-or">' + (L.method ? '¿No se abre? Hazlo a mano:' : 'Desde aquí no se puede abrir solo. Hazlo a mano:') + '</p>' +
      '<ol class="ia-steps">' + st.map(function (s, i) { return '<li><span class="ia-n">' + (i + 1) + '</span>' + s[0] + '<p>' + s[1] + '</p></li>'; }).join('') + '</ol>' +
      '<div class="ia-acts"><button class="sp-btn sp-cream sp-sm" data-shape="2" data-ia="stay"><span class="sp-t">Seguir aquí<span class="ia-ig"> igualmente</span></span></button></div></div>';
    escRoot.setAttribute('data-where', where);
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(escRoot); } catch (e) { } }
    escRoot.querySelectorAll('[data-ia]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var a = b.getAttribute('data-ia');
        if (a === 'open') escGo(true); else if (a === 'copy') copyLink(); else if (a === 'stay') stayHere();
      });
    });
  }
  function say(t) { var m = escRoot && escRoot.querySelector('.ia-msg'); if (m) m.textContent = t; }
  /** Intenta abrir el navegador de verdad. tap = con el toque del jugador (en iPhone solo así). */
  function escGo(tap) {
    var L = links();
    if (!L.method) { hint(); return false; }
    if (!tap && !(isAndroid && AUTO_AND[app] && L.method === 'intent')) return false;
    if (tap) say('Abriendo el navegador…');
    clearTimeout(escTimer);
    if (L.method === 'intent') nav(L.intent);
    else if (L.method === 'intentAny') nav(L.intentAny);
    else if (L.method === 'ig') nav(L.ig);
    else if (L.method === 'safariWin') nav(L.safari, true);
    else nav(L.safari);
    // si a los 1,6 s la página sigue a la vista, no ha salido: a mano
    escTimer = setTimeout(function () { if (document.visibilityState !== 'hidden' && escOpen()) hint(); }, 1600);
    return true;
  }
  function hint() {
    if (!escRoot) return;
    say('¿No se ha abierto? Sigue los pasos o copia el enlace y pégalo en ' + (isIOS ? 'Safari' : 'Chrome') + '.');
    escRoot.classList.remove('ia-hl'); void escRoot.offsetWidth; escRoot.classList.add('ia-hl');
  }
  function copyLink() {
    var u = links().https, where = isIOS ? 'Safari' : 'Chrome';
    function ok() { say('Enlace copiado: pégalo en ' + where + ' (o en tu navegador).'); }
    function manual() {
      var inp = escRoot && escRoot.querySelector('.ia-url'), done = false;
      if (inp) {
        inp.hidden = false;
        try { inp.focus({ preventScroll: true }); inp.select(); inp.setSelectionRange(0, u.length); done = document.execCommand('copy'); } catch (e) { done = false; }
      }
      if (done) ok(); else say('Mantén el dedo sobre el enlace, cópialo y pégalo en ' + where + '.');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(u).then(ok, manual); return; }
    } catch (e) { }
    manual();
  }
  function stayHere() { try { localStorage.setItem(STAY, '1'); } catch (e) { } escClose(); }
  function escOpen() { return !!(escRoot && !escRoot.hidden); }
  /** Abre la hoja. auto = arranque (intenta el intent automático si es seguro); tap = viene de un toque (intenta ya). */
  function escape(o) {
    o = o || {};
    escBuild(); escRender();
    if (!escOpen()) escFocus = document.activeElement;
    escRoot.hidden = false;
    try { (escRoot.querySelector('[data-ia="open"]') || escRoot.querySelector('[data-ia="copy"]')).focus({ preventScroll: true }); } catch (e) { }
    if (o.tap) escGo(true);
    else if (o.auto && isAndroid && AUTO_AND[app] && !mark) {
      var last = 0; try { last = +localStorage.getItem(TRY) || 0; } catch (e) { }
      if (Date.now() - last > 600000) {
        try { localStorage.setItem(TRY, String(Date.now())); } catch (e) { }
        setTimeout(function () { if (escOpen()) escGo(false); }, 900);
      }
    }
    if (mark === 'nochrome' || mark === 'fail') say(mark === 'nochrome' ? 'No hemos encontrado Chrome: toca el botón y elige tu navegador.' : '');
  }
  function escClose() {
    clearTimeout(escTimer);
    if (!escRoot || escRoot.hidden) return;
    escRoot.hidden = true;
    try { if (escFocus && escFocus.focus) escFocus.focus({ preventScroll: true }); } catch (e) { }
  }
  function escAuto() {
    if (!inApp || stayed() || /[?&](debug|autopilot|noinstall|noinapp)\b/.test(location.search || '')) return;
    setTimeout(function () { if (!escOpen() && !stayed()) escape({ auto: true }); }, 400);
  }

  // ---- «Gira el móvil» (#rotate): a los ~4 s a la vista sin girar, ayuda. En navegador de app, «Abrir en el navegador» (la misma
  // hoja, ya intentando con ese toque); fuera, «¿No gira? Quita el bloqueo de rotación» con la instrucción de su sistema.
  var ROT_MS = 4000, rotT = 0;
  function rotHelp(rot) {
    var h = rot.querySelector('.rot-help');
    if (!h) {
      escCss();
      h = document.createElement('div'); h.className = 'rot-help'; h.hidden = true;
      var lockIOS = '<strong>iPhone:</strong> desliza desde la esquina de arriba a la derecha y toca el <strong>candado</strong> de la rotación.';
      var lockAnd = '<strong>Android:</strong> baja la barra de arriba y activa <strong>Rotación automática</strong>.';
      h.innerHTML = inApp
        ? '<p class="rh-t">¿No gira? Dentro de ' + (APP_NAME[app] || 'esta app') + ' a veces no se puede.</p>' +
          '<button class="sp-btn sp-kit pri" data-shape="1" data-rh="open"><span class="sp-t">Abrir en el navegador</span></button>'
        : '<p class="rh-t">¿No gira? Quita el bloqueo de rotación</p>' +
          (isIOS ? '<p class="rh-s">' + lockIOS + '</p>' : isAndroid ? '<p class="rh-s">' + lockAnd + '</p>' : '<p class="rh-s">' + lockIOS + '</p><p class="rh-s">' + lockAnd + '</p>');
      rot.appendChild(h);
      if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(h); } catch (e) { } }
      var b = h.querySelector('[data-rh="open"]');
      if (b) b.addEventListener('click', function (e) { e.stopPropagation(); escape({ tap: true }); });
    }
    return h;
  }
  function rotWatch() {
    var rot = document.getElementById('rotate'); if (!rot || !window.MutationObserver) return;
    function upd() {
      clearTimeout(rotT);
      var h = rot.querySelector('.rot-help');
      if (rot.hidden) { if (h) h.hidden = true; return; }
      if (h && !h.hidden) return;
      rotT = setTimeout(function () { if (!rot.hidden) rotHelp(rot).hidden = false; }, ROT_MS);
    }
    new MutationObserver(upd).observe(rot, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('orientationchange', function () { var h = rot.querySelector('.rot-help'); if (h) h.hidden = true; upd(); });
    upd();
  }
  function escBoot() { escAuto(); rotWatch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', escBoot); else escBoot();

  /** Pruebas: fuerza la variante ('ios' | 'android' | 'app') y abre. */
  function _as(k) { isIOS = k === 'ios'; isAndroid = k === 'android'; inApp = k === 'app'; open(); }
  /** Pruebas (mobaudit): fuerza sistema y app de la hoja «Ábrelo en el navegador» y la abre. os 'ios' | 'android'; a = clave de app. */
  function _escAs(os, a) { isIOS = os === 'ios'; isAndroid = os === 'android'; inApp = true; app = a || ''; if (escRoot) escRoot.hidden = true; escape({}); }
  VB.Install = { _as: _as, open: open, close: close, isOpen: isOpen, useful: useful, inApp: inApp, isIOS: isIOS, isAndroid: isAndroid, KEY: KEY,
    app: app, escape: escape, escClose: escClose, escIsOpen: escOpen, links: links, _escAs: _escAs, STAY: STAY, TRY: TRY, ROT_MS: ROT_MS };
})();
