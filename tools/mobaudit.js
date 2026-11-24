#!/usr/bin/env node
/* TAKE THE COURT — tools/mobaudit.js (owner: ui_main)
 * Auditoría de móvil: abre el juego DE VERDAD en Chrome headless (tools/cdp.js; táctil + UA de móvil por defecto) y recorre
 * todas las pantallas del menú, la Carrera, el online y el partido en cada tamaño. Por pantalla × tamaño: captura PNG en
 * <out>/<WxH>/<id>.png y métricas en <out>/metrics.json (código de medida: tools/mobaudit-page.js):
 *   letra visible (px CSS efectivos; < 12 listadas, < 14 contadas), objetivos táctiles < 44×44 o a < 8 px de otro, solapes,
 *   objetivos tapados, recortes (elipsis, line-clamp, overflow oculto), cosas fuera del viewport, salida/acción principal
 *   dentro y pulsables (elementFromPoint), contenedores con desplazamiento y densidad (caracteres y objetivos).
 * Uso: node tools/mobaudit.js [--out dir=tools/out/mobaudit] [--only regex] [--area portada|carrera|online|partido]
 *        [--sizes 568x320,...] [--desktop] [--list] [--merge]
 *   --merge: conserva las demás pantallas de <out>/metrics.json (repasar unas pocas sin repetir la pasada entera).
 *   Env: SIZES=… (igual que --sizes), DESKTOP=1 (añade 1280x720,1920x1080,1024x768 sin táctil; con --desktop solo esos si
 *   no se dan --sizes), DPR=2 (deviceScaleFactor), TOUCH=0 (sin táctil en los tamaños de móvil), GL=swiftshader.
 * Cómo se abre cada pantalla: tabla SCREENS de abajo. Cada fila = {id, area, q (query de index.html; las filas con la misma q
 *   comparten una carga de página, en orden), open (cuerpo JS async en la página; M = window.__MA, ver mobaudit-page.js
 *   helpers(); devolver false = «no se pudo abrir»), wait (ms tras abrir), exit / primary (selectores; '' = no aplica), land (ronda 2:
 *   en vertical se abre apaisado y se gira después: filas que esperan algo del partido en juego, que en vertical se para)}.
 *   Todas las cargas llevan &ma_clean=1 (borra localStorage antes de cargar: sin Carrera ni récord) y &uianim=0.
 *   Estado fijado entre pantallas (movil-aire, 23-nov-2026): zurdos solo en las filas «-zurdos»; Mensajes abre Bandeja; Liga › Clubes,
 *   la lista. Columna «rot» = rótulos no tocables que se montan (#pbug, .sp-sena, #prompt, #banner, #coach, #touchbar). El interruptor
 *   de fitSeg se mide por su fila (.ph-trow) y la flecha del final de un selector (.arr.end) cuenta como desactivada.
 * Vertical (ronda 2, 24-nov-2026; --sizes 360x740,390x844,412x915): tier = html.pv sin .ph; si una carga no acaba en vertical (el
 *   partido en juego: ctx.portraitBlock detiene la simulación) se carga apaisado y se gira. Columna «girar»: las pantallas que enseñan
 *   el aviso #rotate («girar (partido)» = partido en juego, lo esperado; «girar» = fuera del juego, a quitar). La Carrera ya no lo pide.
 * Ronda 2 (paquete sistema-v, notes/movil-aire.md §8.6.1): recortes «permitidos» aparte (antepasado data-trunc="name"|"preview"; columna
 *   perm); los demás, con su texto entero al final de summary.txt; recorte 'o' (overflow oculto con un hijo de texto o una tabla que se
 *   sale); «pie» = texto tapado por el pie (dock, barra, desvanecido) con todo desplazado al final (mobaudit-page.js footCover); «pis» =
 *   rótulos de texto no tocables que se pisan dentro de un panel. Antes de cada pantalla de la Carrera que no es de lesión se cura la
 *   lesión de la muestra (si no, la natl-tarjeta, las Estrellas o la propuesta de puesto salían «De baja» por la fila anterior).
 * Comparar dos pasadas: node tools/mobcompare.js <antes> <después> [salida.html].
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const PG = require('./mobaudit-page.js');

// ------------------------------------------------------------------------------------------------ argumentos
const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--desktop') A.desktop = true;
  else if (a === '--merge') A.merge = true;
  else if (a === '--list') A.list = true;
  else if (a.startsWith('--')) { const k = a.slice(2), eq = k.indexOf('='); if (eq > 0) A[k.slice(0, eq)] = k.slice(eq + 1); else A[k] = argv[++i]; }
}
const OUT = path.resolve(A.out || path.join(CDP.ROOT, 'tools', 'out', 'mobaudit'));
const PHONES = '568x320,667x375,740x360,844x390,915x412', DESKS = '1280x720,1920x1080,1024x768';
const DESK = A.desktop || process.env.DESKTOP === '1';
// (ronda 2) --desktop --sizes a,b: esos tamaños SIN táctil y solo ellos (antes se medían dos veces: con táctil y luego sin él)
const DESK_ONLY = !!A.desktop && !!(A.sizes || process.env.SIZES);
let sizeList = (A.sizes || process.env.SIZES || (A.desktop ? '' : PHONES)).split(',').filter(Boolean).map(s => ({ s, touch: !DESK_ONLY && process.env.TOUCH !== '0' }));
if (DESK && !DESK_ONLY) sizeList = sizeList.concat(DESKS.split(',').map(s => ({ s, touch: false })));
const DPR = +process.env.DPR || 1;
const ONLY = A.only ? new RegExp(A.only, 'i') : null;
const AREA = A.area || '';

// ------------------------------------------------------------------------------------------------ pantallas
// Atajos para las filas
const M0 = 'debug=menu';
const SET_TABS = ['audio', 'image', 'cam', 'game', 'a11y', 'kit', 'info'];
const CTL_TABS = ['keyboard', 'gamepad', 'touch'];
const LK_TABS = ['pelo', 'cabeza', 'cara', 'cuerpo', 'brazos', 'piernas', 'colores'];
const PF_TABS = ['vestuario', 'insignias', 'entreno', 'carrera', 'retos', 'sedes', 'hitos', 'cuaderno'];
// (movil-aire §3.13) t[2] = sub-pestaña que se FIJA al abrir sin cambiar el id (Mensajes → Bandeja: si no, a 844 salía en Redes, la última vista)
const CR_TABS = [['match'], ['inbox', '', 'box'], ['player', 'phys'], ['player', 'def'], ['player', 'atk'], ['player', 'badges'], ['player', 'train'], ['player', 'look'],
  ['club', 'info'], ['club', 'mate|team'], ['club', 'contract'], ['club', 'offers'], ['life', 'fame'], ['life', 'shop'], ['life', 'goals'], ['life', 'legacy'],
  ['league', 'table'], ['league', 'cal'], ['league', 'cups'], ['league', 'news'], ['league', 'clubs'], ['honors', 'titles'], ['honors', 'seasons'], ['honors', 'opts'],
  ['inbox', 'wall'], ['club', 'people'], ['life', 'pass'], ['honors', 'stats']];   // (Carrera con vida, 1.13.x)
// Extensiones de la Carrera (20-nov-2026; CONTRACT.md «Extensiones de la Carrera»): cada una prepara su pantalla de muestra con
// X._demo(c, tipo) (true si la ha dejado lista y guardada; false si no puede: la fila falla). XR = fila del hub de la Carrera.
// Las filas con la misma q comparten la carrera de muestra, en orden y otra vez en cada tamaño: una muestra que la cambia para las demás
// (simula la temporada hasta el final, te cede a otro club…) va con XO, que le da una carga de página propia.
const XD = (id, k) => `var X = VB.Career && VB.Career.ext && VB.Career.ext.get('${id}'); if (!X || !X._demo || !X._demo(VB.Career.get(), '${k}')) return false; `;
const XR = (sid, m, id, k, t, s) => ({ id: 'carrera-' + (m === 'hall' ? 'pista' : 'playa') + '-' + sid, area: 'carrera', q: M0 + '&ma=' + (m === 'hall' ? 'ch' : 'cb'),
  open: `if (!M.seedCareer('${m}')) return false; ` + XD(id, k) + `return M.career('${t}'${s ? `, '${s}'` : ''});` });
const XO = (sid, m, id, k, t, s) => { const r = XR(sid, m, id, k, t, s); r.q += '&mx=' + sid; return r; };
// Estrellas en Partido: la tarjeta queda bajo la cabecera del hub; se espera a que esté y se baja hasta ella
const XAS = r => Object.assign(r, { open: r.open.replace(/return (M\.career\([^)]*\));$/, "await $1; var e = await M.until(()=>document.querySelector('#career .as-card'),2000) && document.querySelector('#career .as-card'); if (!e) return false; e.scrollIntoView({block:'center'}); return true;") });
const PAUSE_EXIT = '#btnResume';
// (ronda 2) cura la lesión de las dos Carreras de muestra (playa y pista) sin cambiar nada más; deja el modo como estaba
const HEAL = "(function(){try{var C=VB.Career;if(!C||!C.get||!C.setMode)return 0;var m0=C.mode?C.mode():null,n=0;['beach','hall'].forEach(function(m){if(C.has&&!C.has(m))return;C.setMode(m);var c=C.get();if(!c)return;var ch=false;if(c.inj&&c.inj.cur){c.inj.cur=null;c.inj.back=0;c.inj.rust=0;ch=true;}if(c.last&&c.last.inj){delete c.last.inj;ch=true;}if(ch){C.save(c);n++;}});if(m0)C.setMode(m0);return n;}catch(e){return -1}})()";
const HUD_EXIT = '#btnHudPause, #touch .vt-pause';   // (táctil: la pausa es la del overlay)

const SCREENS = [
  // ---------------- PORTADA (menú)
  { id: 'home', area: 'portada', q: M0, open: 'return M.ensureMenu();', exit: '', primary: '#btnPlay' },
  { id: 'jugar', area: 'portada', q: M0, open: "return M.page('play');", primary: '' },
  { id: 'quick-2v2', area: 'portada', q: M0, open: "await M.ensureMenu(); VB.ctx.actions.setSetting('format','2v2'); return M.page('quick');" },
  { id: 'quick-6v6', area: 'portada', q: M0, open: "await M.ensureMenu(); VB.ctx.actions.setSetting('format','6v6'); return M.page('quick');" },
  // (partidos cortos, informe 4.5: los valores más largos de Dificultad y Duración)
  { id: 'quick-corto', area: 'portada', q: M0, open: "await M.ensureMenu(); VB.ctx.actions.setSetting('format','2v2'); VB.ctx.actions.setSetting('difficulty','expert'); VB.ctx.actions.setSetting('matchLen','clutch'); VB.ctx.actions.setSetting('setPoints',25); return M.page('quick');" },
  { id: 'entreno', area: 'portada', q: M0, open: "return M.page('gym');", primary: '' },
  ...SET_TABS.map(t => ({ id: 'ajustes-' + t, area: 'portada', q: M0, open: `return M.panel('#btnSettings','#pnSet','#setTabs','${t}');`, primary: '' })),
  ...CTL_TABS.map(t => ({ id: 'controles-' + t, area: 'portada', q: M0, open: `return M.panel('#btnControls','#pnCtl','#ctlTabs','${t}');`, primary: '' })),
  // disposición táctil (1.22.0, imprescindible 4.2): el editor a pantalla completa, de fábrica y con zurdos + un botón movido y más grande
  // (carga propia: el editor tapa la pantalla y las filas que comparten carga lo heredarían)
  { id: 'controles-touch-editor', area: 'portada', q: M0 + '&ma=te', open: "if (!(await M.panel('#btnControls','#pnCtl','#ctlTabs','touch'))) return false; var b = document.querySelector('[data-tedit]'); if (!b) return false; b.click(); await M.sleep(150); return VB.Input.editing();", wait: 300, exit: '.vte-ok', primary: '' },
  { id: 'controles-touch-editor-zurdos', area: 'portada', q: M0 + '&ma=tz', open: "await M.ensureMenu(); VB.Input.closeEditor(); VB.ctx.actions.setSetting('touchMirror', true); VB.ctx.actions.setSetting('touchLayout', { hit: { x: 0.7, y: 0.55, s: 1.3 }, jump: { o: 0.6 } }); if (!VB.Input.editLayout()) return false; await M.sleep(150); return VB.Input.editing();", wait: 300, exit: '.vte-ok', primary: '' },
  ...[0, 1, 2, 3, 4, 5].map(k => ({ id: 'comojuega-' + (k + 1), area: 'portada', q: M0, open: `return M.tutStep(${k});` })),
  ...[0, 1, 2].map(k => ({ id: 'jugadores-g' + k, area: 'portada', q: M0, open: `return M.panel('#btnSquad','#pnSquad','#sqTabs','g${k}');`, primary: '' })),
  { id: 'acerca-novedades', area: 'portada', q: M0, open: "await M.ensureMenu(); VB.UI.openAbout('news'); await M.sleep(80); return VB.UI.isPanelOpen();", primary: '' },
  { id: 'acerca-creditos', area: 'portada', q: M0, open: "await M.ensureMenu(); VB.UI.openAbout('credits'); await M.sleep(80); return VB.UI.isPanelOpen();", primary: '' },
  // Opiniones (1.22.1, js/feedback.js): el formulario desde Ajustes › Info (sugerencia) y el de bug ya enviado sin red (cola)
  { id: 'opiniones-sug', area: 'portada', q: M0, open: "if (!(await M.panel('#btnSettings','#pnSet','#setTabs','info'))) return false; M.click('[data-go=\"fbsug\"]'); await M.sleep(150); return VB.UI._settings().panel === 'fb';", primary: '#fbSend' },
  { id: 'opiniones-bug', area: 'portada', q: M0, open: "await M.ensureMenu(); if (!VB.UI.openFeedback('bug')) return false; await M.sleep(120); return VB.UI._settings().panel === 'fb';", primary: '#fbSend' },
  { id: 'aviso-colocador', area: 'portada', q: M0 + '&setnote=1', open: "await M.ensureMenu(); VB.UI.setterNote({from:'menu'}); await M.sleep(120); return VB.UI.noteOpen();", exit: '[data-sn="later"]' },
  { id: 'primer-partido', area: 'portada', q: M0 + '&panel=first', open: "return M.until(()=>VB.UI.isPanelOpen(),2000);" },
  { id: 'home-jugarya', area: 'portada', q: M0 + '&now=1', open: 'return M.ensureMenu();', exit: '', primary: '#btnNow' },   // «Jugar ya» (1.22.0): portada de quien no ha jugado nunca
  // «Seguir el partido» (1.22.0, informe 4.9): portada con un partido a medias guardado (lo guardado es de mentira: solo se pinta)
  { id: 'home-seguir', area: 'portada', q: M0 + '&seguir=1&ma=sg', open: "localStorage.setItem('make-the-cut.resume', JSON.stringify({ f: 1, v: VB.VERSION, t: Date.now(), kind: 'quick', opts: {}, gOpts: {}, snap: { v: 2 }, sc: { score: [18, 15], sets: [1, 0], setNo: 2, one: false, size: 2 } })); VB.UI.refreshMenu(); await M.sleep(200); return M.ensureMenu();", exit: '', primary: '#btnSeguir' },
  { id: 'home-seguir-carrera', area: 'portada', q: M0 + '&seguir=1&ma=sgc', open: "M.seedCareer('beach'); localStorage.setItem('make-the-cut.resume', JSON.stringify({ f: 1, v: VB.VERSION, t: Date.now(), kind: 'quick', opts: {}, gOpts: {}, snap: { v: 2 }, sc: { score: [24, 23], sets: [0, 0], setNo: 1, one: true, size: 6 } })); VB.UI.refreshMenu(); await M.sleep(300); return M.ensureMenu();", exit: '', primary: '#btnSeguir' },
  { id: 'home-carrera', area: 'portada', q: M0 + '&ma=hc', open: "M.seedCareer('beach'); await M.sleep(300); return M.ensureMenu();", exit: '', primary: '#btnPlay' },
  { id: 'retos-hoy', area: 'portada', q: 'debug=retos', open: "await M.ensureMenu(); return VB.UI.openRetos('hoy');" },
  { id: 'retos-maestria', area: 'portada', q: 'debug=retos', open: "await M.ensureMenu(); return VB.UI.openRetos('maestria');" },
  { id: 'retos-semana', area: 'portada', q: 'debug=retos', open: "await M.ensureMenu(); return VB.UI.openRetos('semana');" },
  { id: 'retos-semana-grupo', area: 'portada', q: 'debug=semana&semdemo=1', open: "await M.ensureMenu(); return VB.UI.openRetos('semana');" },
  ...LK_TABS.map(t => ({ id: 'vestuario-' + t, area: 'portada', q: 'debug=look', open: `if (VB.UI.menuPage()!=='look') { await M.ensureMenu(); VB.UI.openLook({}); await M.idle(); } return M.click('#lkTabs [data-tab="${t}"]') && VB.UI.menuPage()==='look';` })),
  ...PF_TABS.map(t => ({ id: 'perfil-' + t, area: 'portada', q: 'debug=prof&pfseed=demo', open: `if (VB.UI.menuPage()!=='prof') { await M.ensureMenu(); VB.UI.openProfile({tab:'${t}'}); await M.idle(); } return M.click('#pfTabs [data-tab="${t}"]') && VB.UI.menuPage()==='prof';` })),
  { id: 'cuenta-entrar', area: 'portada', q: M0 + '&ma=acc', open: "await M.ensureMenu(); return VB.Account._preview('enter',{tab:'in'});", exit: '[data-ac="close"]', primary: '' },
  { id: 'cuenta-crear', area: 'portada', q: M0 + '&ma=acc', open: "await M.ensureMenu(); return VB.Account._preview('enter',{tab:'new'});", exit: '[data-ac="close"]', primary: '' },
  { id: 'cuenta-dentro', area: 'portada', q: M0 + '&ma=acc', open: "await M.ensureMenu(); return VB.Account._preview('in',{user:'jugadora7',kind:'user'});", exit: '[data-ac="close"]', primary: '' },
  { id: 'cuenta-borrar', area: 'portada', q: M0 + '&ma=acc', open: "await M.ensureMenu(); return VB.Account._preview('del',{user:'jugadora7',kind:'user'});", exit: '[data-ac="close"]', primary: '' },
  { id: 'instalar-ios', area: 'portada', q: M0 + '&ma=inst', open: "await M.ensureMenu(); VB.Install._as('ios'); return VB.Install.isOpen();", exit: '[data-in="close"]', primary: '' },
  { id: 'instalar-android', area: 'portada', q: M0 + '&ma=inst', open: "await M.ensureMenu(); VB.Install._as('android'); return VB.Install.isOpen();", exit: '[data-in="close"]', primary: '' },
  { id: 'instalar-app', area: 'portada', q: M0 + '&ma=inst', open: "await M.ensureMenu(); VB.Install._as('app'); return VB.Install.isOpen();", exit: '[data-in="close"]', primary: '' },

  // ---------------- ONLINE (?olmock=1: salas de mentira, sin red)
  ...['list', 'help', 'noacc', 'off', 'nortc'].map(v => ({ id: 'online-' + v, area: 'online', q: M0 + '&online=1&olmock=1', open: `return M.online('${v}');`, primary: '' })),
  { id: 'online-aviso', area: 'online', q: M0 + '&online=1&olmock=1', open: "return M.online('list', {msg:'No se ha podido entrar en la sala: ya está llena o la han cerrado.', msgBad:true});", primary: '' },
  { id: 'online-create', area: 'online', q: M0 + '&online=1&olmock=1', open: "return M.online('create');", primary: '.sp-patch' },
  { id: 'online-room', area: 'online', q: M0 + '&online=1&olmock=1', open: "return M.online('room');", primary: '' },
  { id: 'online-room-rival', area: 'online', q: M0 + '&online=1&olmock=1', open: "return M.online('rival');", primary: '' },

  // ---------------- CARRERA (playa y pista; la de muestra se crea en la página)
  { id: 'carrera-crear-playa', area: 'carrera', q: M0 + '&ma=cc', open: "await M.ensureMenu(); VB.CareerUI.open('create',{from:'main'}); await M.sleep(80); M.click('#career [data-act=\"mode\"][data-m=\"beach\"]'); await M.sleep(80); return VB.CareerUI._state().view==='create';" },
  { id: 'carrera-crear-pista', area: 'carrera', q: M0 + '&ma=cc', open: "await M.ensureMenu(); VB.CareerUI.open('create',{from:'main'}); await M.sleep(80); M.click('#career [data-act=\"mode\"][data-m=\"hall\"]'); await M.sleep(80); return VB.CareerUI._state().view==='create';" },
  // «Seguir el partido» en la Carrera (22-nov-2026): el hub bloqueado con el partido a medias (foto de muestra con la firma del partido que toca)
  { id: 'carrera-a-medias', area: 'carrera', q: M0 + '&ma=crl', open: "if (!M.seedCareer('beach')) return false; localStorage.setItem('make-the-cut.resume.career', JSON.stringify({ f: 1, v: VB.VERSION, t: Date.now(), kind: 'career', cm: VB.Career.matchSig(), opts: {}, gOpts: {}, snap: { v: 2 }, sc: { score: [14, 12], sets: [1, 0], ss: [[21, 18]], setNo: 2, one: false, size: 2, pts: 21, tw: 2 } })); if (!M.career()) return false; await M.sleep(150); return !!document.querySelector('#career [data-act=\"lock-go\"]');", primary: '#career [data-act="lock-go"]' },
  { id: 'carrera-ofertas-playa', area: 'carrera', q: M0 + '&ma=cp', open: "if (!M.seedCareer('beach','pick')) return false; return M.career();" },
  { id: 'carrera-ofertas-pista', area: 'carrera', q: M0 + '&ma=cp6', open: "if (!M.seedCareer('hall','pick')) return false; return M.career();" },
  ...['beach', 'hall'].flatMap(m => CR_TABS.filter(t => !(m === 'beach' && t[1] === 'cups')).map(t => {
    const sub = t[1] ? (t[1].split('|')[m === 'hall' ? 1 : 0] || t[1]) : '';
    return { id: 'carrera-' + (m === 'beach' ? 'playa' : 'pista') + '-' + t[0] + (sub ? '-' + sub : ''), area: 'carrera', q: M0 + '&ma=' + (m === 'beach' ? 'cb' : 'ch'),
      // league-clubs: la lista (no la última ficha abierta) · life-legacy / honors-seasons: en el móvil career-ui funde Fama+Legado y
      // Vitrina+Temporadas (career-ui.js setSub, LIFE_PH): al abrir Legado / Temporadas, career-ui baja solo a su ancla (phAfter / phReveal,
      // #crAnLegacy / #crAnSeasons; movil-aire §5.4), así que estas filas capturan la vista FUSIONADA ya en su ancla
      open: `if (!M.seedCareer('${m}')) return false; ` + (sub === 'clubs' ? `if (VB.CareerWorldUI && VB.CareerWorldUI.reset) VB.CareerWorldUI.reset(); ` : '') +
        `return M.career('${t[0]}', '${t[2] || sub}');` };
  })),
  { id: 'carrera-playa-club-ficha', area: 'carrera', q: M0 + '&ma=cb', open: "if (!M.seedCareer('beach')) return false; await M.career('league','clubs'); await M.sleep(60); if (!document.querySelector('#career .cw-card')) M.click('#career .cw-row'); await M.sleep(60); return !!document.querySelector('#career .cw-card');" },
  { id: 'carrera-pista-club-ficha', area: 'carrera', q: M0 + '&ma=ch', open: "if (!M.seedCareer('hall')) return false; await M.career('league','clubs'); await M.sleep(60); if (!document.querySelector('#career .cw-card')) M.click('#career .cw-row'); await M.sleep(60); return !!document.querySelector('#career .cw-card');" },
  // rencor y cariño de los clubes (21-nov-2026): etiquetas en las ofertas (una con rencor, otra con cariño) y en la ficha del club
  ...['beach', 'hall'].map(m => ({ id: 'carrera-ofertas-rencor-' + (m === 'beach' ? 'playa' : 'pista'), area: 'carrera', q: M0 + '&ma=' + (m === 'beach' ? 'cpr' : 'cpr6'),
    open: `if (!M.seedCareer('${m}','pick')) return false; var C = VB.Career, c = C.get(), L = VB.CareerLife; if (!L || !L.ensure) return false; L.ensure(c);
      var o = c.offers.filter(function (x) { return !x.trial; });
      if (o[0]) { c.life.bond.k[o[0].club] = { v: -70, why: ['early'], s: 1, said: 0 }; o[0].bond = -2; o[0].bondK = 0.7; o[0].bondRole = 1; }
      if (o[1]) { c.life.bond.k[o[1].club] = { v: 60, why: ['title'], s: 1, said: 0 }; o[1].bond = 2; }
      C.save(c); return M.career();` })),
  { id: 'carrera-playa-club-rencor', area: 'carrera', q: M0 + '&ma=cbr', open: "if (!M.seedCareer('beach')) return false; var C = VB.Career, c = C.get(), L = VB.CareerLife; if (!L || !L.ensure) return false; L.ensure(c); c.clubs.forEach(function (k) { c.life.bond.k[k.id] = { v: -70, why: ['derbi'], s: 1, said: 0 }; }); C.save(c); await M.career('league','clubs'); await M.sleep(60); if (!document.querySelector('#career .cw-card')) M.click('#career .cw-row'); await M.sleep(60); return !!document.querySelector('#career .cw-card');" },
  { id: 'carrera-pista-club-rencor', area: 'carrera', q: M0 + '&ma=chr', open: "if (!M.seedCareer('hall')) return false; var C = VB.Career, c = C.get(), L = VB.CareerLife; if (!L || !L.ensure) return false; L.ensure(c); c.clubs.forEach(function (k) { c.life.bond.k[k.id] = { v: -70, why: ['derbi'], s: 1, said: 0 }; }); C.save(c); await M.career('league','clubs'); await M.sleep(60); if (!document.querySelector('#career .cw-card')) M.click('#career .cw-row'); await M.sleep(60); return !!document.querySelector('#career .cw-card');" },
  // extensiones de la Carrera (20-nov-2026): selección, lesiones, Estrellas, cesiones, premios, puesto, juvenil y saque de firma
  XR('club-natl', 'hall', 'natl', 'sum', 'club', 'natl'), XR('club-natl', 'beach', 'natl', 'sum', 'club', 'natl'),
  XR('natl-tarjeta', 'hall', 'natl', 'q', 'match'), XR('club-natl-clasif', 'hall', 'natl', 'q', 'club', 'natl'), XR('natl-palmares', 'hall', 'natl', 'sum', 'honors', 'titles'),
  XO('natl-verano', 'beach', 'natl', 'off', 'match'), XO('club-natl-verano', 'beach', 'natl', 'off', 'club', 'natl'),
  XR('lesion', 'beach', 'inj', 'tob2', 'player', 'train'), XR('lesion', 'hall', 'inj', 'rod3', 'player', 'train'),
  XR('partido-baja', 'beach', 'inj', 'hom2', 'match'), XR('partido-baja', 'hall', 'inj', 'tob2', 'match'),
  ...[XR('estrellas-voto', 'beach', 'allstar', 'vote', 'match'), XR('estrellas-voto', 'hall', 'allstar', 'vote', 'match'),
    XR('estrellas-finde', 'hall', 'allstar', 'event', 'match'), XR('estrellas-finde', 'beach', 'allstar', 'event', 'match')].map(XAS),
  XR('estrellas-vitrina', 'beach', 'allstar', 'log', 'honors', 'titles'), XR('estrellas-vitrina', 'hall', 'allstar', 'log', 'honors', 'titles'),
  { id: 'carrera-estrellas-concurso-hoja', area: 'carrera', q: 'debug=drill_end&career=1&ext=allstar&k=srv', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900, exit: '#btnGeList' },
  { id: 'carrera-estrellas-partido-hoja', area: 'carrera', q: 'debug=over&cr=1&ext=allstar&k=match', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  // hoja final de un partido con la selección (career-natl.js _endDemo): el billete con el torneo de nombre más largo y la derrota de grupo con el país más largo
  { id: 'carrera-natl-partido-hoja', area: 'carrera', q: 'debug=over&cr=1&ext=natl&k=q', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-natl-partido-hoja-derrota', area: 'carrera', q: 'debug=over&cr=1&ext=natl&k=loss', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  XR('cesiones', 'hall', 'loan', 'opts', 'club', 'offers'), XR('cesiones', 'beach', 'loan', 'opts', 'club', 'offers'),
  XR('traspaso-renovar', 'hall', 'loan', 'renew', 'club', 'contract'), XR('traspaso-no', 'hall', 'loan', 'no', 'club', 'contract'), XO('cedido', 'hall', 'loan', 'on', 'club', 'contract'),
  XR('cesion-aviso', 'hall', 'loan', 'opts', 'match'), XO('fin-cesion', 'beach', 'loan', 'back', 'match'),
  XR('league-race', 'beach', 'race', '', 'league', 'race'), XR('league-race', 'hall', 'race', '', 'league', 'race'),
  XO('premios-datos', 'beach', 'race', 'data', 'league', 'race'), XO('premios-datos', 'hall', 'race', 'data', 'league', 'race'),
  XO('gala', 'hall', 'race', 'gala', 'match'),
  XR('propuesta-puesto', 'hall', 'dev', 'pos', 'match'), XR('plan', 'beach', 'dev', 'planOpen', 'player', 'train'), XR('pedir-puesto', 'hall', 'dev', 'askOpen', 'player', 'train'),
  ...[['playa', 'beach'], ['pista', 'hall']].flatMap(([n, m]) => [['intro', 'intro'], ['intro3', 'intro3'], ['temporada', 'season'], ['equipo', 'team'], ['chat', 'chat'], ['informe', 'scout']].map(([id, st]) => ({
    id: 'carrera-juvenil-' + id + '-' + n, area: 'carrera', q: M0 + '&ma=j' + m.charAt(0) + st,
    open: `var X = VB.Career && VB.Career.ext && VB.Career.ext.get('pro'); if (!X || !X._demo || !X._demo(null, '${m}:${st}')) return false; return M.career();` }))),
  { id: 'carrera-juvenil-hoja', area: 'carrera', q: 'debug=over&cr=1&ext=pro&k=end', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-crear-juvenil', area: 'carrera', q: M0 + '&ma=cc', open: "await M.ensureMenu(); VB.CareerUI.open('create',{from:'main'}); await M.sleep(80); var b = document.querySelector('#career [data-act=\"pro-start\"]'); if (!b) return false; b.scrollIntoView({block:'center'}); return true;" },   // (fila «Inicio» de crear: desde juvenil o directo)
  // «Te tienen estudiado» (21-nov-2026): informe del rival con estudio (en el móvil, la hoja abierta desde la tira)
  // (carga de página propia —mx=informe—: con la muestra compartida de ma=cb/ch, «partido-baja» deja al jugador lesionado y la Carrera
  //  ya no ofrece partido ni informe; fallaba «no se pudo abrir» en la pasada entera, 22-nov-2026)
  { id: 'carrera-playa-informe', area: 'carrera', q: M0 + '&ma=cb&mx=informe', open: "if (!M.seedCareer('beach')) return false; var C = VB.Career, c = C.get(); c.study = { h: [{ d: 8, l: 2, n: 7.6 }, { d: 7, l: 3, n: 7.4 }] }; C.save(c); await M.career('match'); await M.sleep(60); var b = document.querySelector('#career [data-act=\"est\"]'); if (b) { b.click(); await M.sleep(120); } return !!document.querySelector('#career .cr-est, #career .cr-est-b');", primary: '.sp-sheet .sp-dock button' },
  { id: 'carrera-pista-informe', area: 'carrera', q: M0 + '&ma=ch&mx=informe', open: "if (!M.seedCareer('hall')) return false; var C = VB.Career, c = C.get(); c.study = { h: [{ d: 8, l: 2, n: 7.6 }, { d: 7, l: 3, n: 7.4 }] }; C.save(c); await M.career('match'); await M.sleep(60); var b = document.querySelector('#career [data-act=\"est\"]'); if (b) { b.click(); await M.sleep(120); } return !!document.querySelector('#career .cr-est, #career .cr-est-b');", primary: '.sp-sheet .sp-dock button' },
  // «Te tienen estudiado» con la tira CERRADA en el hub (ticket + tira + barra: que quepan sin desplazar; las de arriba abren la hoja)
  ...['beach', 'hall'].map(m => ({ id: 'carrera-' + (m === 'beach' ? 'playa' : 'pista') + '-informe-tira', area: 'carrera', q: M0 + '&ma=' + (m === 'beach' ? 'cbt' : 'cht'),
    open: `if (!M.seedCareer('${m}')) return false; var C = VB.Career, c = C.get(); c.study = { h: [{ d: 8, l: 2, n: 7.6 }, { d: 7, l: 3, n: 7.4 }] }; C.save(c); await M.career('match'); await M.sleep(80); return !!document.querySelector('#career .cr-est, #career .cr-est-b');` })),
  { id: 'carrera-playa-saque-firma', area: 'carrera', q: M0 + '&ma=cb', open: "if (!M.seedCareer('beach') || !VB.SERVE_SIG) return false; return M.career('player', 'badges');" },
  { id: 'carrera-pista-aviso-colocador', area: 'carrera', q: M0 + '&ma=ch&setnote=1', open: "if (!M.seedCareer('hall')) return false; await M.career('match'); VB.UI.setterNote({from:'career'}); await M.sleep(120); return VB.UI.noteOpen();", exit: '[data-sn="later"]' },
  { id: 'carrera-prueba-previa-playa', area: 'carrera', q: 'debug=trial&pre=1', open: 'return M.until(()=>VB.CareerUI.isOpen(),3000);' },
  { id: 'carrera-prueba-previa-pista', area: 'carrera', q: 'debug=trial&pre=1&mode=hall', open: 'return M.until(()=>VB.CareerUI.isOpen(),3000);' },
  { id: 'carrera-prueba-hoja', area: 'carrera', q: 'debug=trial', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-prueba-suspendida', area: 'carrera', q: 'debug=trial&fail=1&mode=hall', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-hoja-final', area: 'carrera', q: 'debug=over&cr=1', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-resumen-jornada', area: 'carrera', q: 'debug=recap&career=1', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-resumen-stats', area: 'carrera', q: 'debug=recap&career=1&tab=stats', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'carrera-sesion-hoja', area: 'carrera', q: 'debug=drill_end&career=1', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900, exit: '#btnGeList' },
  { id: 'carrera-banquillo', area: 'carrera', q: 'debug=bench6', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'carrera-previa', area: 'carrera', q: 'debug=intro&kind=long&career=1&t=3', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),5000);", wait: 600, exit: '', primary: '' },
  // árbitros con nombre (21-nov-2026): la designación en la previa larga y la ficha «Frenar a … / Dejarle» (playa y pista)
  { id: 'carrera-previa-arbitro', area: 'carrera', q: 'debug=intro&kind=long&career=1&arb=1&t=3', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),5000);", wait: 600, exit: '', primary: '' },
  { id: 'partido-frenar-playa', area: 'partido', q: 'debug=amb&k=brake', open: "return M.until(()=>!!document.querySelector('#ambChoice.show'),55000);", openMs: 60000, wait: 250, exit: '', primary: '', land: true },
  { id: 'partido-frenar-pista', area: 'partido', q: 'debug=amb&k=brake&format=6v6', open: "return M.until(()=>!!document.querySelector('#ambChoice.show'),55000);", openMs: 60000, wait: 250, exit: '', primary: '', land: true },

  // ---------------- PARTIDO
  { id: 'hud-2v2', area: 'partido', q: 'debug=hud', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 1200, exit: HUD_EXIT, primary: '' },
  { id: 'hud-2v2-zurdos', area: 'partido', q: 'debug=rally', open: "await M.until(()=>VB.ctx.state==='playing',5000); VB.ctx.actions.setSetting('touchMirror', true); return true;", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'hud-2v2-peloteo', area: 'partido', q: 'debug=rally', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'hud-6v6', area: 'partido', q: 'debug=rally6h', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'hud-punto', area: 'partido', q: 'debug=setpoint', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  // idea «senas»: pie del Cuaderno del árbitro con la fecha y la línea de reglamento (2 líneas, sin elipsis)
  { id: 'perfil-cuaderno-pie', area: 'portada', q: 'debug=prof&pfseed=demo', open: "if (VB.UI.menuPage()!=='prof') { await M.ensureMenu(); VB.UI.openProfile({tab:'cuaderno'}); await M.idle(); } M.click('#pfTabs [data-tab=\"cuaderno\"]'); await M.sleep(150); return M.click('#pfGrid [data-aid=\"sen:tocado\"]');", wait: 400 },
  // idea «senas»: pegatina de la seña en la pestaña (palabras largas) y en la cinta (VB.UI._sena la deja 3 s)
  { id: 'hud-sena', area: 'partido', q: 'debug=setpoint', open: "await M.until(()=>VB.ctx.state==='playing',5000); return VB.UI._sena('retraso',1);", wait: 700, exit: HUD_EXIT, primary: '' },
  { id: 'hud-sena-bajo', area: 'partido', q: 'debug=setpoint', open: "await M.until(()=>VB.ctx.state==='playing',5000); return VB.UI._sena('bajo',1);", wait: 700, exit: HUD_EXIT, primary: '' },
  { id: 'hud-sena-5s', area: 'partido', q: 'debug=setpoint&map=beach', open: "await M.until(()=>VB.ctx.state==='playing',5000); return VB.UI._sena('retraso',1,'5 SEGUNDOS');", wait: 700, exit: HUD_EXIT, primary: '' },
  { id: 'hud-sena-cinta', area: 'partido', q: 'debug=setpoint', open: "await M.until(()=>VB.ctx.state==='playing',5000); return VB.UI._sena('cuatro',2);", wait: 700, exit: HUD_EXIT, primary: '' },
  { id: 'hud-cambio', area: 'partido', q: 'debug=sub6', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'hud-zona', area: 'partido', q: 'debug=rally&zone=1', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'hud-zona-6v6', area: 'partido', q: 'debug=rally6h&zone=2', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'hud-saque-firma', area: 'partido', q: 'debug=serve&sig=abajo&gest=tres', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 1200, exit: HUD_EXIT, primary: '' },
  { id: 'hud-entreno', area: 'partido', q: 'debug=drill_serve', open: "return M.until(()=>VB.ctx.state==='playing',5000);", wait: 600, exit: HUD_EXIT, primary: '' },
  { id: 'previa', area: 'partido', q: 'debug=intro&kind=short&t=2', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),5000);", wait: 600, exit: '', primary: '' },
  { id: 'semana-previa', area: 'partido', q: 'debug=semana_play&semwk=202648&intro=1&kind=mini', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),5000);", wait: 600, exit: '', primary: '' },
  { id: 'semana-pausa', area: 'partido', q: 'debug=semana_play&semwk=202650&pause=1', open: "await M.until(()=>VB.ctx.state==='paused',5000); for (let i=0;i<4&&VB.UI.isPanelOpen();i++){M.click('#btnPanelBack'); await M.sleep(60);} return VB.ctx.state==='paused' && !VB.UI.isPanelOpen();", wait: 500, exit: PAUSE_EXIT },
  { id: 'semana-hoja', area: 'partido', q: 'debug=semana_end', open: "return M.until(()=>VB.ctx.state==='over',8000);", wait: 1500, exit: '', primary: '#btnAgain' },
  { id: 'pausa', area: 'partido', q: 'debug=pause', open: "await M.until(()=>VB.ctx.state==='paused',5000); for (let i=0;i<4&&VB.UI.isPanelOpen();i++){M.click('#btnPanelBack'); await M.sleep(60);} return VB.ctx.state==='paused' && !VB.UI.isPanelOpen();", wait: 500, exit: PAUSE_EXIT },
  { id: 'pausa-controles', area: 'partido', q: 'debug=pause', open: "await M.until(()=>VB.ctx.state==='paused',5000); if (!VB.UI.isPanelOpen()) M.click('#btnPControls'); await M.sleep(150); return VB.UI.isPanelOpen();", primary: '' },
  { id: 'pausa-bug', area: 'partido', q: 'debug=pause', open: "await M.until(()=>VB.ctx.state==='paused',5000); for (let i=0;i<4&&VB.UI.isPanelOpen();i++){M.click('#btnPanelBack'); await M.sleep(60);} M.click('#btnPBug'); await M.sleep(150); return VB.UI._settings().panel === 'fb';", primary: '#fbSend' },
  { id: 'pausa-ajustes', area: 'partido', q: 'debug=pause', open: "await M.until(()=>VB.ctx.state==='paused',5000); for (let i=0;i<4&&VB.UI.isPanelOpen();i++){M.click('#btnPanelBack'); await M.sleep(60);} M.click('#btnPSettings'); await M.sleep(150); return VB.UI.isPanelOpen();", primary: '' },
  { id: 'cambios-6v6', area: 'partido', q: 'debug=subs6menu', open: "return M.until(()=>VB.UI.isPanelOpen(),5000);", wait: 500, primary: '' },
  { id: 'cambios-6v6-elegido', area: 'partido', q: 'debug=subs6menu&pick=1', open: "return M.until(()=>VB.UI.isPanelOpen(),5000);", wait: 500, primary: '' },
  { id: 'final-resumen', area: 'partido', q: 'debug=over', open: "await M.until(()=>VB.ctx.state==='over',5000); await M.sleep(600); return M.click('#endTabs [data-tab=\"sum\"]') || true;", wait: 600 },
  { id: 'final-primero', area: 'partido', q: 'debug=over&first=1', open: "await M.until(()=>VB.ctx.state==='over',5000); await M.sleep(600); M.click('#endTabs [data-tab=\"sum\"]'); var r=document.querySelector('#end .rc-first'); if (r) r.scrollIntoView({block:'nearest'}); return !!r;", wait: 600 },   // «Y ahora» tras el primer partido (1.22.0)
  { id: 'final-stats', area: 'partido', q: 'debug=over', open: "await M.until(()=>VB.ctx.state==='over',5000); await M.sleep(300); return M.click('#endTabs [data-tab=\"stats\"]');", wait: 500 },
  { id: 'final-jugadas', area: 'partido', q: 'debug=best&tab=plays', open: "await M.until(()=>VB.ctx.state==='over',8000); await M.sleep(600); M.click('#endTabs [data-tab=\"plays\"]'); return VB.ctx.state==='over';", wait: 600 },
  { id: 'final-reto', area: 'partido', q: 'debug=reto_end', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900 },
  { id: 'final-entreno', area: 'partido', q: 'debug=drill_end', open: "return M.until(()=>VB.ctx.state==='over',5000);", wait: 900, exit: '#btnGeList' },
  { id: 'estadistica-2v2', area: 'partido', q: 'debug=stats', open: "return M.until(()=>VB.UI.isPanelOpen(),8000);", wait: 700, primary: '' },
  { id: 'estadistica-6v6', area: 'partido', q: 'debug=stats&format=6v6', open: "return M.until(()=>VB.UI.isPanelOpen(),8000);", wait: 700, primary: '' },
  { id: 'repeticion', area: 'partido', q: 'debug=replay&rpt=1', open: "return M.until(()=>VB.ctx.state==='playing',8000);", wait: 1500, exit: '', primary: '' },
];

// ------------------------------------------------------------------------------------------------ utilidades
const sleep = ms => new Promise(r => setTimeout(r, ms));
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, j) => { t = setTimeout(() => j(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }
const CLEAN = "if(/[?&]ma_clean=1/.test(location.search)){try{localStorage.clear();sessionStorage.clear()}catch(e){}}";
function score(m) {   // peor = más alto (para elegir el peor tamaño de cada pantalla)
  if (!m || m.err) return 1e6;
  return m.fonts.n12 * 2 + m.fonts.n14 + m.targets.nSmall * 3 + m.targets.nOverlap * 3 + m.targets.covered.length + (m.targets.huge ? m.targets.huge.length * 10 : 0) + m.nClipped * 2 + m.nOff * 3 +
    (m.exit && !m.exit.ok ? 25 : 0) + (m.primary && !m.primary.ok ? 15 : 0);
}

async function waitReady(page) {
  const ok = await page.evalJs(`new Promise(res=>{const t0=Date.now();(function f(){try{if(window.VB&&VB.UI&&VB.ctx&&VB.UI._boot&&VB.UI._boot().stage>=2&&document.fonts.status==='loaded')return res(true)}catch(e){} if(Date.now()-t0>20000)return res(false); setTimeout(f,100)})()})`, true).catch(() => false);
  await sleep(700);
  await page.evalJs('(' + PG.helpers.toString() + ')()');
  return ok;
}

async function main() {
  let screens = SCREENS.filter(s => (!ONLY || ONLY.test(s.id)) && (!AREA || s.area === AREA));
  if (A.list) { for (const s of screens) console.log(s.area.padEnd(8) + ' ' + s.id + '  [' + s.q + ']'); console.log(screens.length + ' pantallas'); return 0; }
  if (!screens.length) { console.error('ninguna pantalla con ese filtro'); return 1; }
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const metrics = { started: new Date().toISOString(), root: CDP.ROOT, sizes: sizeList.map(x => x.s), dpr: DPR, screens: {} };
  if (A.merge) { try { const old = JSON.parse(fs.readFileSync(path.join(OUT, 'metrics.json'), 'utf8')); metrics.screens = old.screens || {}; metrics.sizes = [...new Set((old.sizes || []).concat(metrics.sizes))]; } catch (e) { } }
  for (const s of screens) metrics.screens[s.id] = Object.assign({ area: s.area, q: s.q, bySize: {} }, A.merge && metrics.screens[s.id] ? { bySize: metrics.screens[s.id].bySize } : {});
  // grupos por perfil (táctil o no: ctx.isTouch se decide al cargar) y por query
  const profiles = [];
  for (const sz of sizeList) { let p = profiles.find(x => x.touch === sz.touch); if (!p) profiles.push(p = { touch: sz.touch, sizes: [] }); p.sizes.push(sz.s); }
  const groups = []; for (const s of screens) { let g = groups.find(x => x.q === s.q); if (!g) groups.push(g = { q: s.q, list: [] }); g.list.push(s); }
  const page = await CDP.open({ size: sizeList[0].s, touch: profiles[0].touch, dpr: DPR, init: [CLEAN] });
  const deskUA = String(await page.evalJs('navigator.userAgent')).replace('HeadlessChrome', 'Chrome');
  let nFail = 0;
  try {
    for (const prof of profiles) {
      if (prof.touch) await page.send('Emulation.setUserAgentOverride', { userAgent: CDP.ANDROID_UA, platform: 'Linux armv8l' });
      else await page.send('Emulation.setUserAgentOverride', { userAgent: deskUA });
      for (const g of groups) {
        const tg = Date.now();
        await page.setSize(prof.sizes[0], prof.touch, DPR);
        page.errors.length = 0;
        await page.navigate('ma_clean=1&uianim=0&' + g.q);
        let ready = await waitReady(page);
        // (ronda 2) en vertical el partido en juego no arranca (ctx.portraitBlock detiene la simulación y la carga no acaba): se carga
        // apaisado y se gira, como quien gira el móvil con el partido empezado; así sale el aviso de girar
        const [pw0, ph0] = prof.sizes[0].split('x').map(Number);
        if (!ready && ph0 > pw0) {
          process.stderr.write('  (vertical) ' + g.q + ': no cargó en vertical; se carga apaisado y se gira\n');
          await page.setSize(ph0 + 'x' + pw0, prof.touch, DPR); page.errors.length = 0;
          await page.navigate('ma_clean=1&uianim=0&' + g.q);
          ready = await waitReady(page);
        }
        if (!ready) process.stderr.write('  (aviso) la página no dijo «lista» para ' + g.q + '\n');
        for (const sz of prof.sizes) {
          await page.setSize(sz, prof.touch, DPR); await sleep(350);
          for (const s of g.list) {
            const rec = metrics.screens[s.id];
            let ok = false, err = '';
            // el scrollAll de la medida anterior no debe dejar la siguiente pantalla (o talla) ya desplazada
            try { await page.evalJs('(' + PG.resetScroll.toString() + ')()'); await sleep(80); } catch (e) { }
            // (movil-aire §3.13) zurdos solo en las filas «-zurdos»: hud-2v2-peloteo heredaba el espejo de hud-2v2-zurdos (misma carga)
            if (!/zurdos/.test(s.id)) { try { await page.evalJs("try{if(VB.ctx&&VB.ctx.settings&&VB.ctx.settings.touchMirror===true)VB.ctx.actions.setSetting('touchMirror',false)}catch(e){}"); } catch (e) { } }
            // (ronda 2) la lesión de la muestra (filas «-lesion» y «-partido-baja») no pasa a las demás pantallas de la Carrera de la misma carga
            if (s.area === 'carrera' && !/lesion|partido-baja/.test(s.id)) { try { await page.evalJs(HEAL); } catch (e) { } }
            // (ronda 2) land: en vertical el partido en juego se para (portraitBlock) y lo que espera la fila no llega: se abre apaisado y se gira
            const [lw, lh] = sz.split('x').map(Number), landNow = !!s.land && lh > lw;
            if (landNow) { await page.setSize(lh + 'x' + lw, prof.touch, DPR); await sleep(350); }
            try {
              const r = await withTimeout(page.evalJs('(async()=>{const M=window.__MA;' + s.open + '})()', true), s.openMs || 20000, s.id);   // (openMs: filas que tardan en abrir, p. ej. la ficha de una disputa)
              ok = r !== false && r !== null && r !== 0;
              if (!ok) err = 'no se pudo abrir';
            } catch (e) { err = 'no se pudo abrir: ' + String(e.message || e).split('\n')[0].slice(0, 160); }
            await sleep(s.wait || 220);
            if (landNow) { await page.setSize(sz, prof.touch, DPR); await sleep(450); }
            // (ronda 2, sistema-v: la Carrera ya no pide girar —fuera crPortrait de ui.js—; el aviso #rotate se mide tal cual: columna «girar»)
            const file = path.join(OUT, sz, s.id + '.png');
            let m = null;
            try { m = await withTimeout(page.evalJs('(' + PG.measure.toString() + ')(' + JSON.stringify({ exit: s.exit, primary: s.primary }) + ')'), 20000, 'medir ' + s.id); }
            catch (e) { err = err || ('medida: ' + String(e.message || e).slice(0, 160)); }
            try { await page.shot(file); } catch (e) { }
            // (móvil, spec §6.1.5) cada zona desplazable al final y otra medida: salida y principal siguen dentro y pulsables
            if (m && !m.err && !err) {
              try {
                const nS = await page.evalJs('(' + PG.scrollAll.toString() + ')()');
                if (nS > 0) {
                  await sleep(160);
                  const m2 = await withTimeout(page.evalJs('(' + PG.measure.toString() + ')(' + JSON.stringify({ exit: s.exit, primary: s.primary }) + ')'), 20000, 'medir ' + s.id);
                  m.afterScroll = { n: nS, exit: m2.exit, primary: m2.primary };
                }
                // (ronda 2) tapado por el pie: lo que, con todo al final, sigue debajo del dock, la barra o el desvanecido
                m.foot = await withTimeout(page.evalJs('(' + PG.footCover.toString() + ')()'), 20000, 'pie ' + s.id);
              } catch (e) { }
            }
            if (!m) m = { err: err || 'sin métricas' };
            // (ronda 2) tier por orientación: escritorio sin .ph ni .pv; móvil apaisado .ph; móvil en vertical (táctil, ancho <= 500) .pv y sin .ph
            if (m.tier) { const [tw, th] = sz.split('x').map(Number), desk = DESKS.split(',').includes(sz), port = th > tw;
              m.tierOk = desk ? (!m.tier.ph && !m.tier.pv) : port ? (prof.touch && tw <= 500 ? m.tier.pv && !m.tier.ph : !m.tier.ph) : m.tier.ph; }
            if (err) { m.err = err; nFail++; process.stderr.write('  ✗ ' + s.id + ' @' + sz + ': ' + err + '\n'); }
            if (page.errors.length) { m.jsErrors = page.errors.slice(0, 5); page.errors.length = 0; }
            m.shot = path.relative(OUT, file).replace(/\\/g, '/');
            rec.bySize[sz] = m;
          }
        }
        process.stderr.write('· ' + g.q.padEnd(36) + ' ' + g.list.length + ' pantallas, ' + ((Date.now() - tg) / 1000).toFixed(1) + ' s\n');
      }
    }
  } finally { page.close(); }
  metrics.seconds = Math.round((Date.now() - t0) / 1000);
  // resumen
  const rows = [];
  for (const id of Object.keys(metrics.screens)) {
    const sc = metrics.screens[id], bs = sc.bySize; let worst = null, ws = -1;
    for (const sz of Object.keys(bs)) { const v = score(bs[sz]); if (v > ws) { ws = v; worst = sz; } }
    const m = bs[worst] || {};
    const minF = Math.min(...Object.values(bs).map(x => x.fonts && x.fonts.min != null ? x.fonts.min : 99));
    const needExit = (SCREENS.find(z => z.id === id) || {}).exit !== '';
    const exitOk = Object.values(bs).every(x => x.err ? false : x.exit ? x.exit.ok : !needExit), primOk = Object.values(bs).every(x => !x.primary || x.primary.ok);
    // (móvil, spec §6.1) tier correcto en todos los tamaños; tras desplazar, salida y principal siguen; elipsis que cortan; pestañas que no caben
    const tierOk = Object.values(bs).every(x => x.tierOk !== false);
    const scrOk = Object.values(bs).every(x => !x.afterScroll || ((!x.afterScroll.exit || x.afterScroll.exit.ok || !(x.exit && x.exit.ok)) && (!x.afterScroll.primary || x.afterScroll.primary.ok || !(x.primary && x.primary.ok))));
    const ell = Math.max(0, ...Object.values(bs).map(x => x.nEllBad || 0)), tabs = Math.max(0, ...Object.values(bs).map(x => (x.tabOver || []).length));
    const hscr = Object.values(bs).some(x => x.hscroll);
    // (ronda 2) aviso de girar en algún tamaño: «girar (partido)» = en juego, lo esperado; «girar» = fuera del juego, a quitar
    const rotate = Object.values(bs).some(x => x.rotate) ? (Object.values(bs).every(x => !x.rotate || x.rotateGame) ? 'girar (partido)' : 'girar') : '';
    const rot = Math.max(0, ...Object.values(bs).map(x => x.rot ? x.rot.n : 0));   // (movil-aire: rótulos no tocables que se solapan)
    // (ronda 2) recortes permitidos (data-trunc), tapado por el pie y rótulos de texto pisados: el máximo de los tamaños
    const perm = Math.max(0, ...Object.values(bs).map(x => x.nClippedOk || 0)), foot = Math.max(0, ...Object.values(bs).map(x => x.foot ? x.foot.n : 0)), pis = Math.max(0, ...Object.values(bs).map(x => x.pis ? x.pis.n : 0));
    sc.summary = { worst, score: ws, minFont: minF === 99 ? null : minF, n12: m.fonts ? m.fonts.n12 : null, n14: m.fonts ? m.fonts.n14 : null, smallT: m.targets ? m.targets.nSmall : null,
      overlap: m.targets ? m.targets.nOverlap : null, huge: m.targets && m.targets.huge ? m.targets.huge.length : null, clipped: m.nClipped != null ? m.nClipped : null, off: m.nOff != null ? m.nOff : null, exitOk, primOk, tierOk, scrOk, ell, tabs, rot, perm, foot, pis, rotate, hscr, err: Object.values(bs).some(x => x.err) ? (Object.values(bs).find(x => x.err).err) : '' };
    rows.push([id, sc.area, sc.summary]);
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1));
  const head = 'pantalla'.padEnd(36) + ' área     peor       letraMin  <12  <14  toq<44 solap enorme recort fuera salida princ tier despl elip pest  rot perm  pie  pis';
  const lines = [head, '-'.repeat(head.length)];
  for (const [id, area, s] of rows) {
    lines.push(id.padEnd(36) + ' ' + area.padEnd(8) + ' ' + String(s.worst || '-').padEnd(10) + ' ' + String(s.minFont == null ? '-' : s.minFont).padStart(8) + ' ' + String(s.n12 ?? '-').padStart(4) + ' ' + String(s.n14 ?? '-').padStart(4) + ' ' +
      String(s.smallT ?? '-').padStart(6) + ' ' + String(s.overlap ?? '-').padStart(5) + ' ' + String(s.huge ?? '-').padStart(6) + ' ' + String(s.clipped ?? '-').padStart(6) + ' ' + String(s.off ?? '-').padStart(5) + ' ' + (s.exitOk ? '  ok  ' : '  NO  ') + (s.primOk ? ' ok  ' : ' NO  ') +
      (s.tierOk ? ' ok ' : ' NO ') + (s.scrOk ? '  ok  ' : '  NO  ') + String(s.ell ?? '-').padStart(4) + String(s.tabs ?? '-').padStart(5) + String(s.rot ?? '-').padStart(5) + String(s.perm ?? '-').padStart(5) + String(s.foot ?? '-').padStart(5) + String(s.pis ?? '-').padStart(5) + (s.rotate ? '  [' + s.rotate + ']' : '') + (s.hscr ? '  ¡scroll lateral!' : '') + (s.err ? '  ! ' + s.err : ''));
  }
  lines.push('', 'tier = html.ph en los tamaños de móvil apaisados, html.pv (sin .ph) en los verticales y sin ninguno en 1280x720 / 1920x1080 / 1024x768 · despl = tras llevar cada zona al final, la salida y la principal',
    'siguen dentro y pulsables · elip = elipsis que cortan información (salvo .sp-lrow .sp-s y [data-ph-ell]) · pest = filas de pestañas que no caben sin desvanecido ·',
    'rot = rótulos NO tocables que se montan (#pbug, .sp-sena, #prompt, #banner, #coach, #touchbar) · recort = recortes NO permitidos (elipsis, line-clamp,',
    'overflow, o = hijo de texto o tabla que se sale de su caja) · perm = recortes permitidos (data-trunc="name"|"preview") · pie = texto tapado por el',
    'dock / la barra / el desvanecido con todo desplazado al final · pis = rótulos de texto no tocables que se pisan en un panel · [girar] = enseña #rotate.',
    'En metrics.json además: fonts.read14 / btn15 / tab13 (lectura < 14, rótulos < 15, pestañas < 13), reach (principal abajo a la derecha, aviso), hscroll.');
  // (ronda 2) recortes NO permitidos con su texto entero (todos los tamaños), tapado por el pie y pisados: para los paquetes siguientes
  const det = ['', 'Recortes no permitidos (texto entero), tapado por el pie y pisados, por pantalla y tamaño:'];
  for (const id of Object.keys(metrics.screens)) {
    const bs = metrics.screens[id].bySize;
    for (const sz of Object.keys(bs)) {
      const x = bs[sz]; if (!x || !x.fonts) continue;
      for (const c of (x.clipped || [])) det.push('  ' + id + ' @' + sz + ' [' + c.kind + '] ' + c.s + ' «' + (c.full || c.t) + '»');
      for (const c of ((x.foot && x.foot.list) || [])) det.push('  ' + id + ' @' + sz + ' [pie:' + c.why + '] ' + c.s + ' «' + c.t + '» bajo ' + c.by);
      for (const c of ((x.pis && x.pis.list) || [])) det.push('  ' + id + ' @' + sz + ' [pis] «' + c.at + '» / «' + c.bt + '»');
    }
  }
  const txt = lines.concat(det).join('\n');
  fs.writeFileSync(path.join(OUT, 'summary.txt'), txt + '\n');
  console.log(lines.join('\n'));
  console.log('\n' + rows.length + ' pantallas × ' + sizeList.length + ' tamaños en ' + metrics.seconds + ' s; fallos al abrir: ' + nFail + '\n→ ' + OUT);
  return 0;
}

main().then(c => process.exit(c || 0), e => { console.error(e && e.stack || e); process.exit(1); });
