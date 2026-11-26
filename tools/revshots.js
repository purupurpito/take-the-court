#!/usr/bin/env node
/* TAKE THE COURT — tools/revshots.js (owner: ui_main)
 * Inventario de capturas para la REVISIÓN GENERAL (móvil primero): todas las pantallas y estados visibles por ZONA y TAMAÑO, para que
 * otros revisores las miren sin abrir Chrome. Un solo Chrome (tools/cdp.js) reutilizado entre capturas; táctil + UA de Android en los
 * tamaños de móvil (se ven los mandos táctiles); 1280x720 / 1920x1080 sin táctil. Las cargas llevan &ma_clean=1 (localStorage vacío:
 * perfil temporal, nunca toca guardados reales) y &uianim=0. Las Carreras de prueba se crean en la página (VB.Career.create).
 *
 * Salida: tools/out/revision/<zona>/<pantalla>-<WxH>.png y tools/out/revision/manifest.json (se fusiona con el anterior: repasar unas
 * pocas no borra las demás; --fresh empieza de cero). Por captura: ok/err, estado (ctx.state, página del menú, vista de la Carrera),
 * errores JS, bytes del PNG (muy pocos = negro o vacío) y la zona segura emulada.
 *
 * Uso: node tools/revshots.js [--zone menus,carrera,partido-playa,partido-pista,pc] [--only regex] [--sizes 568x320,...] [--list] [--fresh]
 *   Tamaños por defecto: móvil apaisado 568x320 640x360 667x375 844x390n 932x430n, vertical 360x640 390x844n (táctil) y 1280x720 (PC);
 *   zona pc: 1280x720 y 1920x1080. Sufijo «n» = muesca (Emulation.setSafeAreaInsetsOverride si este Chrome lo tiene: 47 px a los lados
 *   y 21 abajo en apaisado; 47 arriba y 34 abajo en vertical). --sizes acepta los mismos nombres (con o sin «n»).
 *   Cerrojo de memoria: coge tools/out/chrome.lock (mkdir; espera cada 20 s si existe) y lo suelta al acabar o al fallar (REV_NOLOCK=1 no).
 *   Env: GL=swiftshader (sin GPU), WAIT=ms extra tras abrir cada pantalla, PROBE='cuerpo JS' (se evalúa tras cada captura y se imprime).
 * Filas: {id, zone, q (query de index.html; las de la misma q comparten carga), open (cuerpo JS async en la página; M = window.__MA de
 *   tools/mobaudit-page.js más los extras de aquí; false = «no se pudo abrir»), wait (ms tras abrir), sizes (solo esos)}.
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const PG = require('./mobaudit-page.js');

// ------------------------------------------------------------------------------------------------ argumentos
const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--list' || a === '--fresh') A[a.slice(2)] = true;
  else if (a.startsWith('--')) { const k = a.slice(2), eq = k.indexOf('='); if (eq > 0) A[k.slice(0, eq)] = k.slice(eq + 1); else A[k] = argv[++i]; }
}
const OUT = A.out ? path.resolve(A.out) : path.join(CDP.ROOT, 'tools', 'out', 'revision');   // (--out carpeta: p. ej. tools/out/revision/despues)
const LOCK = path.join(CDP.ROOT, 'tools', 'out', 'chrome.lock');
const ONLY = A.only ? new RegExp(A.only, 'i') : null;
const ZONES = A.zone ? A.zone.split(',').filter(Boolean) : null;
const XWAIT = +process.env.WAIT || 0;

const NOTCH_L = { left: 47, right: 47, top: 0, bottom: 21 }, NOTCH_P = { left: 0, right: 0, top: 47, bottom: 34 };
function sizeOf(tok) {
  const n = /n$/.test(tok), s = tok.replace(/n$/, ''), [w, h] = s.split('x').map(Number);
  const desk = (w === 1280 && h === 720) || (w === 1920 && h === 1080) || (w === 1024 && h === 768);
  return { s, w, h, touch: !desk, notch: n ? (w >= h ? NOTCH_L : NOTCH_P) : null, tok };
}
const PHONE = '568x320,640x360,667x375,844x390n,932x430n,360x640,390x844n'.split(',');
const DEF_SIZES = PHONE.concat(['1280x720']);
const PC_SIZES = ['1280x720', '1920x1080'];

// ------------------------------------------------------------------------------------------------ pantallas
const M0 = 'debug=menu';
const SET_TABS = ['audio', 'image', 'cam', 'game', 'a11y', 'kit', 'info'];
const CTL_TABS = ['keyboard', 'gamepad', 'touch'];
const LK_TABS = ['pelo', 'cabeza', 'cara', 'cuerpo', 'brazos', 'piernas', 'colores'];
const PF_TABS = ['vestuario', 'insignias', 'entreno', 'carrera', 'retos', 'sedes', 'hitos'];
const CR_TABS = [['match'], ['inbox', 'box'], ['inbox', 'wall'], ['player', 'phys'], ['player', 'def'], ['player', 'atk'], ['player', 'badges'], ['player', 'train'], ['player', 'look'],
  ['club', 'info'], ['club', 'mate|team'], ['club', 'people'], ['club', 'contract'], ['club', 'offers'],
  ['life', 'fame'], ['life', 'pass'], ['life', 'shop'], ['life', 'goals'], ['life', 'legacy'],
  ['league', 'table'], ['league', 'cal'], ['league', 'cups'], ['league', 'news'], ['league', 'clubs'],
  ['honors', 'titles'], ['honors', 'stats'], ['honors', 'seasons'], ['honors', 'opts']];
const PLAYING = "return M.until(()=>VB.ctx.state==='playing',8000);";
const OVER = "return M.until(()=>VB.ctx.state==='over',8000);";
const BEACH = '&map=beach';
// cierra los paneles de encima (Estadística sobre la hoja final, Ajustes sobre la pausa…)
const CLOSE_PANELS = "for (let i=0;i<6&&VB.UI.isPanelOpen();i++){M.click('#btnPanelBack'); await M.sleep(80);}";

const SCREENS = [
  // ================================================================ MENÚS
  { id: 'portada', zone: 'menus', q: M0, open: 'return M.ensureMenu();' },
  { id: 'portada-con-carrera', zone: 'menus', q: M0 + '&rv=hc', open: "M.seedCareer('beach'); await M.sleep(300); return M.ensureMenu();" },
  { id: 'portada-perfil', zone: 'menus', q: 'debug=menupf&pfseed=demo', open: 'return M.ensureMenu();' },
  { id: 'portada-foco-jugar', zone: 'menus', q: M0 + '&mjfocus=btnPlay', open: 'await M.ensureMenu(); await M.sleep(2700); return true;' },
  { id: 'jugar', zone: 'menus', q: M0, open: "return M.page('play');" },
  { id: 'partido-rapido-2v2', zone: 'menus', q: M0, open: "await M.ensureMenu(); VB.ctx.actions.setSetting('format','2v2'); return M.page('quick', {});" },
  { id: 'partido-rapido-6v6', zone: 'menus', q: M0, open: "await M.ensureMenu(); VB.ctx.actions.setSetting('format','6v6'); return M.page('quick', {});" },
  { id: 'entrenamiento-menu', zone: 'menus', q: M0, open: "return M.page('gym');" },
  ...SET_TABS.map(t => ({ id: 'ajustes-' + t, zone: 'menus', q: M0, open: `return M.panel('#btnSettings','#pnSet','#setTabs','${t}');` })),
  ...CTL_TABS.map(t => ({ id: 'controles-' + t, zone: 'menus', q: M0, open: `return M.panel('#btnControls','#pnCtl','#ctlTabs','${t}');` })),
  ...[0, 1, 2, 3, 4, 5].map(k => ({ id: 'tutorial-' + (k + 1), zone: 'menus', q: M0, open: `return M.tutStep(${k});` })),
  ...[0, 1, 2].map(k => ({ id: 'jugadores-g' + k, zone: 'menus', q: M0, open: `return M.panel('#btnSquad','#pnSquad','#sqTabs','g${k}');` })),
  { id: 'novedades', zone: 'menus', q: M0, open: "await M.ensureMenu(); VB.UI.openAbout('news'); await M.sleep(120); return VB.UI.isPanelOpen();" },
  { id: 'creditos', zone: 'menus', q: M0, open: "await M.ensureMenu(); VB.UI.openAbout('credits'); await M.sleep(120); return VB.UI.isPanelOpen();" },
  { id: 'aviso-colocador', zone: 'menus', q: M0 + '&setnote=1', open: "await M.ensureMenu(); VB.UI.setterNote({from:'menu'}); await M.sleep(150); return VB.UI.noteOpen();" },
  { id: 'aviso-primer-partido', zone: 'menus', q: M0 + '&panel=first', open: 'return M.until(()=>VB.UI.isPanelOpen(),3000);' },
  { id: 'retos-hoy', zone: 'menus', q: 'debug=retos', open: "await M.ensureMenu(); return VB.UI.openRetos('hoy');" },
  { id: 'retos-maestria', zone: 'menus', q: 'debug=retos', open: "await M.ensureMenu(); return VB.UI.openRetos('maestria');" },
  ...LK_TABS.map(t => ({ id: 'vestuario-' + t, zone: 'menus', q: 'debug=look', open: `if (VB.UI.menuPage()!=='look') { await M.ensureMenu(); VB.UI.openLook({}); await M.idle(); } return M.click('#lkTabs [data-tab="${t}"]') && VB.UI.menuPage()==='look';` })),
  { id: 'vestuario-playa', zone: 'menus', q: 'debug=look&venue=beach', open: "return M.until(()=>VB.UI.menuPage()==='look',4000);" },
  ...PF_TABS.map(t => ({ id: 'perfil-' + t, zone: 'menus', q: 'debug=prof&pfseed=demo', open: `if (VB.UI.menuPage()!=='prof') { await M.ensureMenu(); VB.UI.openProfile({tab:'${t}'}); await M.idle(); } return M.click('#pfTabs [data-tab="${t}"]') && VB.UI.menuPage()==='prof';` })),
  { id: 'perfil-vacio', zone: 'menus', q: 'debug=prof', open: "return M.until(()=>VB.UI.menuPage()==='prof',4000);" },
  { id: 'cuenta-entrar', zone: 'menus', q: M0 + '&rv=acc', open: "await M.ensureMenu(); return VB.Account._preview('enter',{tab:'in'});" },
  { id: 'cuenta-crear', zone: 'menus', q: M0 + '&rv=acc', open: "await M.ensureMenu(); return VB.Account._preview('enter',{tab:'new'});" },
  { id: 'cuenta-dentro', zone: 'menus', q: M0 + '&rv=acc', open: "await M.ensureMenu(); return VB.Account._preview('in',{user:'jugadora7',kind:'user'});" },
  { id: 'cuenta-borrar', zone: 'menus', q: M0 + '&rv=acc', open: "await M.ensureMenu(); return VB.Account._preview('del',{user:'jugadora7',kind:'user'});" },
  { id: 'instalar-ios', zone: 'menus', q: M0 + '&rv=inst', open: "await M.ensureMenu(); VB.Install._as('ios'); return VB.Install.isOpen();" },
  { id: 'instalar-android', zone: 'menus', q: M0 + '&rv=inst', open: "await M.ensureMenu(); VB.Install._as('android'); return VB.Install.isOpen();" },
  { id: 'instalar-app', zone: 'menus', q: M0 + '&rv=inst', open: "await M.ensureMenu(); VB.Install._as('app'); return VB.Install.isOpen();" },
  ...['list', 'help', 'noacc', 'off', 'nortc'].map(v => ({ id: 'online-' + v, zone: 'menus', q: M0 + '&online=1&olmock=1', open: `return M.online('${v}');` })),
  { id: 'online-aviso', zone: 'menus', q: M0 + '&online=1&olmock=1', open: "return M.online('list', {msg:'No se ha podido entrar en la sala: ya está llena o la han cerrado.', msgBad:true});" },
  { id: 'online-crear', zone: 'menus', q: M0 + '&online=1&olmock=1', open: "return M.online('create');" },
  { id: 'online-sala', zone: 'menus', q: M0 + '&online=1&olmock=1', open: "return M.online('room');" },
  { id: 'online-sala-rival', zone: 'menus', q: M0 + '&online=1&olmock=1', open: "return M.online('rival');" },

  // ================================================================ CARRERA
  { id: 'crear-playa', zone: 'carrera', q: M0 + '&rv=cc', open: "await M.ensureMenu(); VB.CareerUI.open('create',{from:'main'}); await M.sleep(100); M.click('#career [data-act=\"mode\"][data-m=\"beach\"]'); await M.sleep(100); return VB.CareerUI._state().view==='create';" },
  { id: 'crear-pista', zone: 'carrera', q: M0 + '&rv=cc', open: "await M.ensureMenu(); VB.CareerUI.open('create',{from:'main'}); await M.sleep(100); M.click('#career [data-act=\"mode\"][data-m=\"hall\"]'); await M.sleep(100); return VB.CareerUI._state().view==='create';" },
  { id: 'ofertas-playa', zone: 'carrera', q: M0 + '&rv=cp', open: "if (!M.seedCareer('beach','pick')) return false; return M.career();" },
  { id: 'ofertas-pista', zone: 'carrera', q: M0 + '&rv=cp6', open: "if (!M.seedCareer('hall','pick')) return false; return M.career();" },
  ...['beach', 'hall'].flatMap(m => CR_TABS.filter(t => !(m === 'beach' && t[1] === 'cups')).map(t => {
    const sub = t[1] ? (t[1].split('|')[m === 'hall' ? 1 : 0] || t[1]) : '';
    return { id: (m === 'beach' ? 'playa' : 'pista') + '-' + t[0] + (sub ? '-' + sub : ''), zone: 'carrera', q: M0 + '&rv=' + (m === 'beach' ? 'cb' : 'ch'),
      open: `if (!M.seedCareer('${m}')) return false; return M.career('${t[0]}', '${sub}');` };
  })),
  { id: 'playa-ficha-club', zone: 'carrera', q: M0 + '&rv=cb', open: "if (!M.seedCareer('beach')) return false; await M.career('league','clubs'); await M.sleep(80); if (!document.querySelector('#career .cw-card')) M.click('#career .cw-row'); await M.sleep(80); return !!document.querySelector('#career .cw-card');" },
  { id: 'pista-ficha-club', zone: 'carrera', q: M0 + '&rv=ch', open: "if (!M.seedCareer('hall')) return false; await M.career('league','clubs'); await M.sleep(80); if (!document.querySelector('#career .cw-card')) M.click('#career .cw-row'); await M.sleep(80); return !!document.querySelector('#career .cw-card');" },
  // Carrera más avanzada (8 jornadas simuladas: prensa, Figura del mes, Camino y Redes con contenido)
  ...['beach', 'hall'].flatMap(m => [['match'], ['inbox', 'box'], ['inbox', 'wall'], ['life', 'pass'], ['honors', 'stats'], ['league', 'table']].map(t => ({
    id: (m === 'beach' ? 'playa' : 'pista') + '-j8-' + t[0] + (t[1] ? '-' + t[1] : ''), zone: 'carrera', q: M0 + '&rv=' + (m === 'beach' ? 'cb8' : 'ch8'),
    open: `if (!M.seedCareerN('${m}', 8)) return false; return M.career('${t[0]}', '${t[1] || ''}');` }))),
  // fin de temporada (simulada entera)
  ...['beach', 'hall'].flatMap(m => [['match'], ['club', 'offers'], ['honors', 'seasons']].map(t => ({
    id: (m === 'beach' ? 'playa' : 'pista') + '-fin-temporada-' + t[0] + (t[1] ? '-' + t[1] : ''), zone: 'carrera', q: M0 + '&rv=' + (m === 'beach' ? 'cbo' : 'cho'),
    open: `if (!M.seedCareerN('${m}', 999)) return false; return M.career('${t[0]}', '${t[1] || ''}');` }))),
  { id: 'pista-aviso-colocador', zone: 'carrera', q: M0 + '&rv=ch&setnote=1', open: "if (!M.seedCareer('hall')) return false; await M.career('match'); VB.UI.setterNote({from:'career'}); await M.sleep(150); return VB.UI.noteOpen();" },
  { id: 'prueba-previa-playa', zone: 'carrera', q: 'debug=trial&pre=1', open: 'return M.until(()=>VB.CareerUI.isOpen(),4000);' },
  { id: 'prueba-previa-pista', zone: 'carrera', q: 'debug=trial&pre=1&mode=hall', open: 'return M.until(()=>VB.CareerUI.isOpen(),4000);' },
  { id: 'prueba-petos-playa', zone: 'carrera', q: 'debug=trial&at=rally', open: PLAYING, wait: 800 },
  { id: 'prueba-petos-pista', zone: 'carrera', q: 'debug=trial&at=rally&mode=hall', open: PLAYING, wait: 800 },
  { id: 'prueba-hoja-aprobada', zone: 'carrera', q: 'debug=trial', open: OVER, wait: 1000 },
  { id: 'prueba-hoja-suspendida', zone: 'carrera', q: 'debug=trial&fail=1&mode=hall', open: OVER, wait: 1000 },
  { id: 'prueba-hoja-abandonada', zone: 'carrera', q: 'debug=trial&tf=2', open: OVER, wait: 1000 },
  { id: 'previa-partido-larga', zone: 'carrera', q: 'debug=intro&kind=long&career=1&t=3', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),6000);", wait: 600 },
  { id: 'previa-partido-jefe', zone: 'carrera', q: 'debug=intro&kind=long&career=1&boss=muro&t=3', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),6000);", wait: 600 },
  { id: 'previa-partido-duelo', zone: 'carrera', q: 'debug=intro&kind=short&career=1&duel=1&t=2', open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),6000);", wait: 600 },
  { id: 'hud-nota-en-directo', zone: 'carrera', q: 'debug=rally&rt=1' + BEACH, open: PLAYING, wait: 900 },
  { id: 'hud-nota-consigna', zone: 'carrera', q: 'debug=rally6h&rt=1&co=recv', open: PLAYING, wait: 900 },
  { id: 'hoja-final-carrera', zone: 'carrera', q: 'debug=over&cr=1' + BEACH, open: OVER, wait: 1000 },
  { id: 'hoja-final-carrera-subida', zone: 'carrera', q: 'debug=over&cr=1&lv=1&rtv=8.6' + BEACH, open: OVER, wait: 1000 },
  { id: 'resumen-jornada', zone: 'carrera', q: 'debug=recap&career=1' + BEACH, open: OVER, wait: 1000 },
  { id: 'resumen-jornada-jefe', zone: 'carrera', q: 'debug=recap&career=1&boss=1&move=2&chem=1' + BEACH, open: OVER, wait: 1000 },
  { id: 'resumen-final-copa', zone: 'carrera', q: 'debug=recap&career=1&cup=final&unl=2', open: OVER, wait: 1000 },
  { id: 'resumen-estadisticas', zone: 'carrera', q: 'debug=recap&career=1&tab=stats' + BEACH, open: OVER, wait: 1000 },
  { id: 'sesion-entreno-hoja', zone: 'carrera', q: 'debug=drill_end&career=1', open: OVER, wait: 1000 },
  { id: 'sesion-entreno-hoja-sube', zone: 'carrera', q: 'debug=drill_end&career=1&up=1', open: OVER, wait: 1000 },
  { id: 'banquillo', zone: 'carrera', q: 'debug=bench6', open: PLAYING, wait: 800 },
  { id: 'estadistica-carrera', zone: 'carrera', q: 'debug=stats&career=1' + BEACH, open: 'return M.until(()=>VB.UI.isPanelOpen(),10000);', wait: 800 },

  // ================================================================ PARTIDO PLAYA (2v2, &map=beach)
  { id: 'previa-corta', zone: 'partido-playa', q: 'debug=intro&kind=short&t=2' + BEACH, open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),6000);", wait: 600 },
  { id: 'previa-mini', zone: 'partido-playa', q: 'debug=intro&kind=mini&t=1' + BEACH, open: "return M.until(()=>!!document.querySelector('#intro:not([hidden])'),6000);", wait: 400 },
  { id: 'saque-espera', zone: 'partido-playa', q: 'debug=serve' + BEACH, open: PLAYING, wait: 1500 },
  { id: 'saque-reloj-8s', zone: 'partido-playa', q: 'debug=serve&clock=1' + BEACH, open: PLAYING, wait: 2500 },
  { id: 'saque-lanzado', zone: 'partido-playa', q: 'debug=toss' + BEACH, open: PLAYING, wait: 700 },
  { id: 'saque-en-salto', zone: 'partido-playa', q: 'debug=jumpserve' + BEACH, open: PLAYING, wait: 700 },
  { id: 'recepcion', zone: 'partido-playa', q: 'debug=rally' + BEACH, open: PLAYING, wait: 700 },
  { id: 'remate', zone: 'partido-playa', q: 'debug=spike' + BEACH, open: PLAYING, wait: 700 },
  { id: 'bloqueo', zone: 'partido-playa', q: 'debug=block' + BEACH, open: PLAYING, wait: 700 },
  { id: 'plancha', zone: 'partido-playa', q: 'debug=dive' + BEACH, open: PLAYING, wait: 700 },
  { id: 'cambio-jugador', zone: 'partido-playa', q: 'debug=switch' + BEACH, open: PLAYING, wait: 700 },
  { id: 'punto', zone: 'partido-playa', q: 'debug=point' + BEACH, open: PLAYING, wait: 700 },
  { id: 'ace', zone: 'partido-playa', q: 'debug=ace&t=0.9' + BEACH, open: PLAYING, wait: 700 },
  { id: 'bola-de-set', zone: 'partido-playa', q: 'debug=setpoint' + BEACH, open: PLAYING, wait: 700 },
  { id: 'challenge-revision', zone: 'partido-playa', q: 'debug=rally&live=1&rv=chal' + BEACH, open: 'return M.challenge(1300);', wait: 0, tmo: 200000 },
  { id: 'challenge-resultado', zone: 'partido-playa', q: 'debug=rally&live=1&rv=chal2' + BEACH, open: 'return M.challenge(5200);', wait: 0, tmo: 200000 },
  { id: 'cambio-de-campo', zone: 'partido-playa', q: 'debug=rally&live=1&rv=court' + BEACH, open: 'return M.courtSwitch();', wait: 0, tmo: 200000,
    note: 'Sin plano de grúa en la playa el rótulo «Cambio de campo» entra y ui.js lo desvanece en el mismo instante (fadeBanner con shot !== court): en la captura no se ve; es un hallazgo, no un fallo de la herramienta.' },
  { id: 'pausa', zone: 'partido-playa', q: 'debug=pause' + BEACH, open: "await M.until(()=>VB.ctx.state==='paused',8000); " + CLOSE_PANELS + " return VB.ctx.state==='paused';", wait: 500 },
  { id: 'pausa-reiniciar-confirmar', zone: 'partido-playa', q: 'debug=pause&rv=rst' + BEACH, open: "await M.until(()=>VB.ctx.state==='paused',8000); " + CLOSE_PANELS + " const b=document.querySelector('#btnRestart'); await M.until(()=>!b.classList.contains('arm'),3000); M.click(b); await M.sleep(150); return b.classList.contains('arm');", wait: 0 },
  { id: 'pausa-controles', zone: 'partido-playa', q: 'debug=pause' + BEACH, open: "await M.until(()=>VB.ctx.state==='paused',8000); " + CLOSE_PANELS + " M.click('#btnPControls'); await M.sleep(200); return VB.UI.isPanelOpen();" },
  { id: 'pausa-ajustes', zone: 'partido-playa', q: 'debug=pause' + BEACH, open: "await M.until(()=>VB.ctx.state==='paused',8000); " + CLOSE_PANELS + " M.click('#btnPSettings'); await M.sleep(200); return VB.UI.isPanelOpen();" },
  { id: 'repeticion', zone: 'partido-playa', q: 'debug=replay&rpt=1' + BEACH, open: PLAYING, wait: 1600 },
  { id: 'final-resumen', zone: 'partido-playa', q: 'debug=over' + BEACH, open: "await M.until(()=>VB.ctx.state==='over',8000); await M.sleep(700); M.click('#endTabs [data-tab=\"sum\"]'); return true;", wait: 600 },
  { id: 'final-estadisticas', zone: 'partido-playa', q: 'debug=over' + BEACH, open: "await M.until(()=>VB.ctx.state==='over',8000); await M.sleep(400); return M.click('#endTabs [data-tab=\"stats\"]');", wait: 600 },
  { id: 'final-jugadas', zone: 'partido-playa', q: 'debug=best&tab=plays' + BEACH, open: "await M.until(()=>VB.ctx.state==='over',10000); await M.sleep(700); M.click('#endTabs [data-tab=\"plays\"]'); return VB.ctx.state==='over';", wait: 600 },
  { id: 'final-reto-del-dia', zone: 'partido-playa', q: 'debug=reto_end' + BEACH, open: OVER, wait: 1000 },
  { id: 'estadistica-partido', zone: 'partido-playa', q: 'debug=stats' + BEACH, open: 'return M.until(()=>VB.UI.isPanelOpen(),10000);', wait: 800 },
  { id: 'estadistica-mapa', zone: 'partido-playa', q: 'debug=stats&sec=map' + BEACH, open: 'return M.until(()=>VB.UI.isPanelOpen(),10000);', wait: 900 },
  { id: 'saque-pabellon-2v2', zone: 'partido-playa', q: 'debug=serve&map=hall', open: PLAYING, wait: 1500 },

  // ================================================================ PARTIDO PISTA (6v6) + ENTRENAMIENTO + ESPECTADOR
  { id: 'tu-saque', zone: 'partido-pista', q: 'debug=serve6h', open: PLAYING, wait: 900 },
  { id: 'saque-rival', zone: 'partido-pista', q: 'debug=tserve6', open: PLAYING, wait: 700 },
  { id: 'recepcion', zone: 'partido-pista', q: 'debug=recv6', open: PLAYING, wait: 700 },
  { id: 'colocacion', zone: 'partido-pista', q: 'debug=rally6h', open: PLAYING, wait: 700 },
  { id: 'remate', zone: 'partido-pista', q: 'debug=spike6', open: PLAYING, wait: 700 },
  { id: 'bloqueo', zone: 'partido-pista', q: 'debug=block6', open: PLAYING, wait: 700 },
  { id: 'punto', zone: 'partido-pista', q: 'debug=point6h', open: PLAYING, wait: 700 },
  { id: 'fin-de-set', zone: 'partido-pista', q: 'debug=setend6', open: PLAYING, wait: 900 },
  { id: 'camara-tv', zone: 'partido-pista', q: 'debug=rally6h&cam6=tv', open: PLAYING, wait: 700 },
  { id: 'rotulo-cambio', zone: 'partido-pista', q: 'debug=sub6', open: PLAYING, wait: 700 },
  { id: 'cambios-panel', zone: 'partido-pista', q: 'debug=subs6menu', open: 'return M.until(()=>VB.UI.isPanelOpen(),8000);', wait: 500 },
  { id: 'cambios-panel-elegido', zone: 'partido-pista', q: 'debug=subs6menu&pick=1', open: 'return M.until(()=>VB.UI.isPanelOpen(),8000);', wait: 500 },
  { id: 'pausa', zone: 'partido-pista', q: 'debug=subs6menu&rv=p', open: "await M.until(()=>VB.ctx.state==='paused',8000); await M.sleep(200); " + CLOSE_PANELS + " return VB.ctx.state==='paused' && !VB.UI.isPanelOpen();", wait: 400 },
  { id: 'banquillo-carrera', zone: 'partido-pista', q: 'debug=bench6', open: PLAYING, wait: 800 },
  { id: 'final-hoja', zone: 'partido-pista', q: 'debug=stats&format=6v6&rv=end', open: "await M.until(()=>VB.UI.isPanelOpen(),12000); await M.sleep(300); " + CLOSE_PANELS + " return VB.ctx.state==='over';", wait: 600 },
  { id: 'final-estadisticas', zone: 'partido-pista', q: 'debug=stats&format=6v6&rv=end', open: "await M.until(()=>VB.UI.isPanelOpen(),12000); await M.sleep(300); " + CLOSE_PANELS + " return M.click('#endTabs [data-tab=\"stats\"]');", wait: 600 },
  { id: 'estadistica-partido', zone: 'partido-pista', q: 'debug=stats&format=6v6', open: 'return M.until(()=>VB.UI.isPanelOpen(),12000);', wait: 800 },
  { id: 'estadistica-rotaciones', zone: 'partido-pista', q: 'debug=stats&format=6v6&sec=rot', open: 'return M.until(()=>VB.UI.isPanelOpen(),12000);', wait: 900 },
  { id: 'espectador-saque', zone: 'partido-pista', q: 'debug=serve6', open: PLAYING, wait: 700 },
  { id: 'espectador-peloteo', zone: 'partido-pista', q: 'debug=rally6', open: PLAYING, wait: 700 },
  { id: 'espectador-punto', zone: 'partido-pista', q: 'debug=point6', open: PLAYING, wait: 700 },
  ...['serve', 'recv', 'set', 'atk', 'block', 'free'].map(d => ({ id: 'entreno-' + d, zone: 'partido-pista', q: 'debug=drill_' + d, open: PLAYING, wait: 800 })),
  { id: 'entreno-hoja', zone: 'partido-pista', q: 'debug=drill_end', open: OVER, wait: 1000 },
  { id: 'entreno-playa-saque', zone: 'partido-pista', q: 'debug=drill_serve' + BEACH, open: PLAYING, wait: 800 },
];

// zona pc: repaso de las pantallas principales de las demás zonas a 1280x720 y 1920x1080
const PC_IDS = ['menus/portada', 'menus/portada-con-carrera', 'menus/jugar', 'menus/partido-rapido-2v2', 'menus/partido-rapido-6v6', 'menus/ajustes-image', 'menus/controles-keyboard',
  'menus/tutorial-1', 'menus/jugadores-g0', 'menus/novedades', 'menus/retos-hoy', 'menus/vestuario-pelo', 'menus/perfil-vestuario', 'menus/cuenta-entrar', 'menus/online-list', 'menus/online-sala',
  'carrera/crear-playa', 'carrera/ofertas-playa', 'carrera/playa-match', 'carrera/playa-inbox-box', 'carrera/playa-league-table', 'carrera/pista-match', 'carrera/pista-club-team',
  'carrera/pista-league-cups', 'carrera/playa-fin-temporada-match', 'carrera/prueba-previa-playa', 'carrera/resumen-jornada', 'carrera/previa-partido-larga',
  'partido-playa/saque-espera', 'partido-playa/recepcion', 'partido-playa/punto', 'partido-playa/pausa', 'partido-playa/final-resumen', 'partido-playa/estadistica-partido', 'partido-playa/repeticion',
  'partido-pista/tu-saque', 'partido-pista/colocacion', 'partido-pista/cambios-panel', 'partido-pista/final-hoja', 'partido-pista/espectador-peloteo', 'partido-pista/entreno-atk'];
for (const k of PC_IDS) {
  const [z, id] = k.split('/'), src = SCREENS.find(s => s.zone === z && s.id === id);
  if (src) SCREENS.push(Object.assign({}, src, { zone: 'pc', id: z + '--' + id, sizes: PC_SIZES }));
}

// ------------------------------------------------------------------------------------------------ extras en la página
function extras() {
  var M = window.__MA; if (!M || M._rv) return true; M._rv = true;
  /** Carrera de muestra con n jornadas simuladas (999 = hasta el fin de temporada). */
  M.seedCareerN = function (mode, n) {
    if (!M.seedCareer(mode)) return false;
    var C = VB.Career, c = C.get();
    if (!c._rvN) {
      for (var i = 0; i < n && c && c.phase !== 'off' && C.simulateNext; i++) {
        // decisiones pendientes que bloqueen la simulación: se ignoran (simulateNext las resuelve o se para)
        try { if (C.simulateNext(c) === false) break; } catch (e) { break; }
        c = C.get();
      }
      c = C.get(); if (c) c._rvN = true;
    }
    try { if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu(); } catch (e) { }
    return !!C.get();
  };
  /** Challenge: con el autopilot en vivo (escena rally&live=1) espera una llamada de línea que tu equipo pueda protestar (o una revisión
   *  que pida la IA), pide el challenge, espera ms y congela. */
  M.challenge = async function (ms) {
    if (M._chal) { return true; }
    var ok = false;
    await M.until(function () {
      var g = VB.ctx.game; if (!g) return false;
      if (g.review) return (ok = true);
      try { if (VB.Sim.canChallenge(g, 0) > 0 && VB.Sim.challenge(g, 0)) return (ok = true); } catch (e) { }
      return false;
    }, 170000, 30);
    if (!ok) return false;
    M._chal = true;
    await M.sleep(ms);
    VB.ctx.frozen = true;
    return true;
  };
  /** Cambio de campo de la playa: autopilot en vivo (escena rally&live=1, marcador puesto a 3-3) hasta el rótulo «Cambio de campo» y se congela. */
  M.courtSwitch = async function () {
    if (M._court) return true;
    var g0 = VB.ctx.game; if (g0 && g0.mode === 'rally' && g0.score[0] + g0.score[1] < 6) { g0.score = [3, 3]; g0.courtSwapAt = 0; }   // (el punto que acaba este peloteo es el 7º: cambio de campo)
    var seen = await M.until(function () { var b = document.getElementById('bn1'); return b && /cambio de campo/i.test(b.textContent) && document.getElementById('banner').classList.contains('show'); }, 180000, 40);
    if (!seen) return false;
    await M.sleep(450);
    VB.ctx.frozen = true; M._court = true;
    return true;
  };
  return true;
}

// ------------------------------------------------------------------------------------------------ utilidades
const sleep = ms => new Promise(r => setTimeout(r, ms));
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, j) => { t = setTimeout(() => j(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }
const CLEAN = "if(/[?&]ma_clean=1/.test(location.search)){try{localStorage.clear();sessionStorage.clear()}catch(e){}}";

async function waitReady(page) {
  const ok = await page.evalJs(`new Promise(res=>{const t0=Date.now();(function f(){try{if(window.VB&&VB.UI&&VB.ctx&&VB.UI._boot&&VB.UI._boot().stage>=2&&document.fonts.status==='loaded')return res(true)}catch(e){} if(Date.now()-t0>25000)return res(false); setTimeout(f,100)})()})`, true).catch(() => false);
  await sleep(700);
  await page.evalJs('(' + PG.helpers.toString() + ')()');
  await page.evalJs('(' + extras.toString() + ')()');
  return ok;
}

let lockHeld = false;
async function takeLock() {
  if (process.env.REV_NOLOCK === '1') return;
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); lockHeld = true; return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    if (i === 0) process.stderr.write('· esperando el cerrojo de Chrome (' + LOCK + ')…\n');
    await sleep(20000);
  }
}
function dropLock() { if (lockHeld) { try { fs.rmdirSync(LOCK); } catch (e) { } lockHeld = false; } }
process.on('exit', dropLock);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { dropLock(); process.exit(130); });

async function main() {
  let screens = SCREENS.filter(s => (!ONLY || ONLY.test(s.id)) && (!ZONES || ZONES.includes(s.zone)));
  const wantSizes = A.sizes ? A.sizes.split(',').filter(Boolean) : null;
  // tamaños de cada fila
  for (const s of screens) {
    let list = s.sizes || DEF_SIZES;
    if (wantSizes) list = list.filter(t => wantSizes.some(w => w.replace(/n$/, '') === t.replace(/n$/, ''))).map(t => wantSizes.find(w => w.replace(/n$/, '') === t.replace(/n$/, '')));
    s._sizes = list.map(sizeOf);
  }
  screens = screens.filter(s => s._sizes.length);
  if (A.list) { for (const s of screens) console.log(s.zone.padEnd(14) + ' ' + s.id.padEnd(40) + ' [' + s.q + '] ' + s._sizes.map(z => z.tok).join(',')); console.log(screens.length + ' pantallas'); return 0; }
  if (!screens.length) { console.error('ninguna pantalla con ese filtro'); return 1; }
  fs.mkdirSync(OUT, { recursive: true });
  const MF = path.join(OUT, 'manifest.json');
  let man = { root: CDP.ROOT, zones: {} };
  if (!A.fresh) { try { man = JSON.parse(fs.readFileSync(MF, 'utf8')); man.zones = man.zones || {}; } catch (e) { } }
  man.updated = new Date().toISOString();
  man.sizes = { phone: PHONE, desktop: ['1280x720'], pc: PC_SIZES, notch: { landscape: NOTCH_L, portrait: NOTCH_P } };
  man.howTo = 'node tools/revshots.js [--zone z1,z2] [--only regex] [--sizes 568x320,844x390n] [--fresh] [--list]';
  const save = () => fs.writeFileSync(MF, JSON.stringify(man, null, 1));

  await takeLock();
  const t0 = Date.now();
  // pasadas: (táctil | escritorio) × (grupos por query) × tamaños × pantallas
  const passes = [true, false];
  const page = await CDP.open({ size: '1280x720', touch: false, init: [CLEAN] });
  const deskUA = String(await page.evalJs('navigator.userAgent')).replace('HeadlessChrome', 'Chrome');
  let safeOk = null, nShots = 0, nFail = 0;
  async function applySize(sz) {
    await page.setSize(sz.s, sz.touch, 1);
    try {
      await page.send('Emulation.setSafeAreaInsetsOverride', { insets: sz.notch || { top: 0, left: 0, bottom: 0, right: 0 } });
      if (safeOk === null) safeOk = true;
    } catch (e) { if (safeOk === null) { safeOk = false; process.stderr.write('  (aviso) este Chrome no emula la zona segura: ' + e.message + '\n'); } }
  }
  try {
    for (const touch of passes) {
      const mine = screens.filter(s => s._sizes.some(z => z.touch === touch));
      if (!mine.length) continue;
      await page.send('Emulation.setUserAgentOverride', touch ? { userAgent: CDP.ANDROID_UA, platform: 'Linux armv8l' } : { userAgent: deskUA });
      const groups = []; for (const s of mine) { let g = groups.find(x => x.q === s.q); if (!g) groups.push(g = { q: s.q, list: [] }); g.list.push(s); }
      for (const g of groups) {
        const tg = Date.now();
        const sizes = []; for (const s of g.list) for (const z of s._sizes) if (z.touch === touch && !sizes.some(x => x.tok === z.tok)) sizes.push(z);
        // carga con el 1r tamaño (ctx.isTouch se decide al cargar)
        await applySize(sizes[0]);
        page.errors.length = 0;
        await page.navigate('ma_clean=1&uianim=0&' + g.q);
        const ready = await waitReady(page);
        if (!ready) process.stderr.write('  (aviso) la página no dijo «lista» para ' + g.q + '\n');
        for (const sz of sizes) {
          await applySize(sz); await sleep(400);
          for (const s of g.list) {
            if (!s._sizes.some(z => z.tok === sz.tok)) continue;
            let ok = false, err = '';
            try { await page.evalJs('(' + PG.resetScroll.toString() + ')()'); } catch (e) { }
            try {
              const r = await withTimeout(page.evalJs('(async()=>{const M=window.__MA;' + s.open + '})()', true), s.tmo || 30000, s.id);
              ok = r !== false && r !== null && r !== 0 && r !== undefined;
              if (!ok) err = 'no se pudo abrir';
            } catch (e) { err = 'no se pudo abrir: ' + String(e.message || e).split('\n')[0].slice(0, 160); }
            await sleep((s.wait == null ? 300 : s.wait) + XWAIT);
            const rel = s.zone + '/' + s.id + '-' + sz.s + '.png', file = path.join(OUT, rel);
            let st = {};
            try { st = await page.evalJs("(function(){var c=VB.ctx,U=VB.UI,CU=VB.CareerUI;return {state:c&&c.state,page:U&&U.menuPage&&U.menuPage(),panel:!!(U&&U.isPanelOpen&&U.isPanelOpen()),career:CU&&CU.isOpen&&CU.isOpen()?(CU._state().view+'/'+CU._state().tab):'',ph:document.documentElement.classList.contains('ph'),touch:!!(c&&c.isTouch),vw:innerWidth,vh:innerHeight,hscroll:document.documentElement.scrollWidth>innerWidth+1}})()") || {}; } catch (e) { }
            let bytes = 0;
            try { await page.shot(file); bytes = fs.statSync(file).size; nShots++; } catch (e) { err = err || 'captura: ' + e.message; }
            const zrec = man.zones[s.zone] = man.zones[s.zone] || { dir: path.join(OUT, s.zone), screens: {} };
            const srec = zrec.screens[s.id] = zrec.screens[s.id] || { q: s.q, shots: {} };
            srec.q = s.q; if (s.note) srec.note = s.note;
            const rec = { file: rel, ok: !err, bytes, state: st, notch: sz.notch ? (safeOk ? 'emulada' : 'no emulada') : '', touch: sz.touch };
            if (err) { rec.err = err; nFail++; process.stderr.write('  ✗ ' + s.zone + '/' + s.id + ' @' + sz.tok + ': ' + err + '\n'); }
            if (bytes && bytes < 15000) rec.warn = 'PNG muy pequeño (¿negro o vacío?)';
            if (page.errors.length) { rec.jsErrors = page.errors.slice(0, 5); page.errors.length = 0; }
            srec.shots[sz.s] = rec;
            if (process.env.PROBE) { try { console.log('PROBE ' + s.id + ' @' + sz.tok + ': ' + await page.evalJs('JSON.stringify((function(){' + process.env.PROBE + '})())')); } catch (e) { console.log('PROBE error: ' + e.message); } }
          }
        }
        save();
        process.stderr.write('· ' + g.q.padEnd(44) + ' ' + g.list.length + ' pantallas × ' + sizes.length + ' tamaños, ' + ((Date.now() - tg) / 1000).toFixed(1) + ' s\n');
      }
    }
  } finally { page.close(); dropLock(); }
  man.safeArea = safeOk ? 'Emulation.setSafeAreaInsetsOverride' : 'no disponible';
  for (const z of Object.keys(man.zones)) man.zones[z].count = Object.values(man.zones[z].screens).reduce((n, s) => n + Object.keys(s.shots).length, 0);
  save();
  console.log(nShots + ' capturas en ' + Math.round((Date.now() - t0) / 1000) + ' s; fallos al abrir: ' + nFail + '\n→ ' + MF);
  return 0;
}

main().then(c => process.exit(c || 0), e => { console.error(e && e.stack || e); dropLock(); process.exit(1); });
