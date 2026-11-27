#!/usr/bin/env node
/* TAKE THE COURT — tools/inapptest.js (owner: ui_main, 25-nov-2026)
 * «Ábrelo en el navegador» (js/install.js): quien abre el juego dentro de Instagram, TikTok, Facebook, WhatsApp… (navegadores de
 * app que no giran ni van a pantalla completa) recibe una hoja para abrirlo en el navegador de verdad. Juego de verdad en Chrome
 * headless (tools/cdp.js) con el UA de cada app (Emulation.setUserAgentOverride) en vertical 390x844, táctil:
 *   1) la hoja sale SOLO en navegadores de app (Instagram, TikTok y Facebook en iPhone y Android, WebView de Android tipo WhatsApp)
 *      y NO en Chrome ni Safari normales ni en la app de Android (TWA: UA de Chrome + display-mode fullscreen, y referrer
 *      android-app://com.takethecourt.app) ni en la web instalada (Instagram + display-mode standalone);
 *   2) los enlaces: intent de Chrome (Android) con package y dirección de reserva, x-safari-https (iPhone) o instagram://extbrowser,
 *      y conservan ruta y query (?sala=…); TikTok/X en iPhone sin botón de abrir (solo pasos + copiar);
 *   3) Android Instagram/Facebook: intent automático una sola vez (window.__vbNavSpy lo recoge en vez de navegar); TikTok solo al tocar;
 *      la marca ttc_ia=nochrome (sin Chrome) pasa al intent sin package, sin automático, y se quita de la dirección;
 *   4) «Seguir aquí igualmente» se recuerda (al recargar no sale);
 *   5) «Gira el móvil» en partido (en vertical, la previa quieta de la 1.24.0 o el partido en juego): a los ~4 s (no antes) sale la ayuda: en app, «Abrir en el navegador» pulsable que
 *      abre la hoja e intenta; en Chrome/Safari, «Quita el bloqueo de rotación» con el texto de su sistema; al girar se va.
 * Capturas en tools/out/inapp/. Uso: node tools/inapptest.js     Sale con 1 si falla algo.
 */
'use strict';
const path = require('path');
const CDP = require('./cdp.js');
const OUT = path.join(__dirname, 'out', 'inapp');
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.setMaxListeners(50);   // (un CDP.open por caso: cada uno deja su escucha de 'exit')
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 12 * 60 * 1000).unref();

const IOS = v => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)`;
const WV = 'Mozilla/5.0 (Linux; Android 14; Pixel 7a Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36';
const UA = {
  igIOS: IOS('17_5') + ' Mobile/15E148 Instagram 334.0.4.32.98 (iPhone14,5; iOS 17_5; es_ES; es; scale=3.00; 1170x2532; 606458367)',
  igAnd: WV + ' Instagram 354.0.0.40.100 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 7a; lynx; lynx; es_ES; 657863712)',
  ttIOS: IOS('17_4') + ' Mobile/15E148 musical_ly_34.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/es Region/ES isDarkMode/0 WKWebView/1 RevealType/Dialog BytedanceWebview/d8a21c6',
  ttAnd: WV + ' trill_2023504060 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/trill app_version/35.4.6 ByteLocale/es Region/ES BytedanceWebview/d8a21c6',
  fbIOS: IOS('17_5') + ' Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.104;FBBV/634118485;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/es_ES;FBOP/80]',
  fbAnd: WV + ' [FB_IAB/FB4A;FBAV/485.0.0.70.77;]',
  waAnd: WV,                                   // WebView de Android sin marca (p. ej. el navegador propio de WhatsApp)
  chrome: CDP.ANDROID_UA,
  safari: IOS('17_5') + ' Version/17.5 Mobile/15E148 Safari/604.1'
};
const Q = 'sala=AB12&x=1';
const HTTPS = 'https://takethecourt.com/?' + Q;     // (file:// → takethecourt.com/ con la misma query)
const SPY = 'window.__navs=[];window.__vbNavSpy=function(u,w){window.__navs.push([u,w])};';

let fails = 0;
const check = (c, m, x) => { if (c) console.log('  ok   ' + m); else { fails++; console.log('  FALLO ' + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } return !!c; };

async function load(ua, opts) {
  opts = opts || {};
  const page = await CDP.open({ size: opts.size || '390x844', touch: true, mobile: true, dpr: 1, init: [SPY].concat(opts.init || []) });
  await page.send('Emulation.setUserAgentOverride', { userAgent: ua, platform: /Android/.test(ua) ? 'Linux armv8l' : /iPhone/.test(ua) ? 'iPhone' : undefined });
  await page.navigate(opts.q != null ? opts.q : Q); await sleep(opts.wait || 2600);
  return page;
}
const state = p => p.evalJs(`JSON.stringify({open:VB.Install.escIsOpen(),inApp:VB.Install.inApp,app:VB.Install.app,navs:window.__navs||[],
  L:VB.Install.links(),openBtn:!!document.querySelector('#inappHelp [data-ia="open"]'),stay:(function(){try{return localStorage.getItem(VB.Install.STAY)}catch(e){return 'x'}})(),
  search:location.search,title:(document.getElementById('iaTitle')||{}).textContent||'',intro:(document.querySelector('#inappHelp .ia-intro')||{}).textContent||''})`).then(JSON.parse);
const click = (p, sel) => p.evalJs(`(function(){var b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true})()`);

async function inAppCase(key, exp) {
  console.log('\n— ' + key);
  const p = await load(UA[key]);
  try {
    let s = await state(p);
    check(s.inApp && s.open, 'sale la hoja «Ábrelo en el navegador»', { inApp: s.inApp, open: s.open });
    check(s.app === exp.app, 'app detectada: ' + exp.app, s.app);
    if (exp.appName) check(s.intro.indexOf(exp.appName) >= 0, 'la hoja nombra la app (' + exp.appName + ')', s.intro);
    check(s.L.https === HTTPS, 'enlace https con ruta y query', s.L.https);
    check(s.L.method === exp.method, 'método: ' + (exp.method || '(ninguno: pasos + copiar)'), s.L.method);
    check(s.openBtn === !!exp.method, exp.method ? 'botón «Abrir en el navegador»' : 'sin botón de abrir (no hay esquema que funcione)');
    if (/And$/.test(key)) {
      const want = 'intent://takethecourt.com/?' + Q + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(HTTPS + '&ttc_ia=nochrome') + ';end';
      check(s.L.intent === want, 'intent de Chrome exacto', s.L.intent);
      check(s.L.intentAny === 'intent://takethecourt.com/?' + Q + '#Intent;scheme=https;S.browser_fallback_url=' + encodeURIComponent(HTTPS + '&ttc_ia=fail') + ';end', 'intent sin package (sin Chrome)', s.L.intentAny);
    } else {
      check(s.L.safari === 'x-safari-' + HTTPS, 'x-safari-https con ruta y query', s.L.safari);
      check(s.L.ig === 'instagram://extbrowser/?url=' + encodeURIComponent(HTTPS), 'instagram://extbrowser con la url codificada', s.L.ig);
    }
    await p.shot(path.join(OUT, key + '-hoja.png'));
    // automático (Android: Instagram/Facebook sí, el resto no). Sale ~1,3 s después de DOMContentLoaded, pero con el arranque del
    // juego ocupando el hilo los temporizadores se retrasan: se espera hasta 6 s
    if (exp.auto) { const t = Date.now(); while (Date.now() - t < 6000 && !(await p.evalJs('(window.__navs||[]).length'))) await sleep(150); s = await state(p); }
    else { await sleep(1500); s = await state(p); }
    check(s.navs.length === (exp.auto ? 1 : 0) && (!exp.auto || s.navs[0][0] === s.L.intent), exp.auto ? 'intent automático una vez (con Chrome)' : 'nada automático', s.navs);
    // toque en «Abrir en el navegador»
    if (exp.method) {
      await click(p, '#inappHelp [data-ia="open"]'); await sleep(200);
      s = await state(p);
      const last = s.navs[s.navs.length - 1] || [];
      const want = { intent: s.L.intent, ig: s.L.ig, safari: s.L.safari, safariWin: s.L.safari }[exp.method];
      check(last[0] === want && last[1] === (exp.method === 'safariWin'), 'al tocar abre ' + exp.method + (exp.method === 'safariWin' ? ' (window.open)' : ''), last);
      await sleep(1700);
      check(await p.evalJs("document.getElementById('inappHelp').classList.contains('ia-hl')&&/No se ha abierto/.test(document.querySelector('#inappHelp .ia-msg').textContent)"), 'si no sale, a los 1,6 s señala los pasos');
    }
    // copiar enlace (headless: clipboard puede fallar; vale el aviso de copiado o el campo con el enlace a mano)
    await click(p, '#inappHelp [data-ia="copy"]'); await sleep(400);
    const cp = JSON.parse(await p.evalJs("JSON.stringify({m:document.querySelector('#inappHelp .ia-msg').textContent,u:(function(i){return i&&!i.hidden?i.value:''})(document.querySelector('#inappHelp .ia-url'))})"));
    check(/copiado|dedo sobre el enlace/i.test(cp.m) && (cp.u === '' || cp.u === HTTPS), 'Copiar enlace avisa (' + cp.m + ')', cp);
    // seguir aquí
    await click(p, '#inappHelp [data-ia="stay"]'); await sleep(200);
    s = await state(p);
    check(!s.open && s.stay === '1', '«Seguir aquí igualmente» cierra y se guarda', { open: s.open, stay: s.stay });
    await p.navigate(Q); await sleep(2400);
    s = await state(p);
    check(!s.open, 'al recargar ya no sale');
    if (exp.auto) check(s.navs.length === 0, 'tras «Seguir aquí» no hay intent automático', s.navs);
  } finally { await p.close(); }
}

// La TWA y la web instalada: Chrome headless no emula display-mode (setEmulatedMedia lo ignora) ni acepta un referrer
// android-app:// en Page.navigate (medido el 25-nov-2026), así que se simulan con un guion antes de cargar la página.
const MEDIA = m => `(function(){var o=window.matchMedia.bind(window);window.matchMedia=function(q){if(/display-mode/.test(q)){var on=q.indexOf('${m}')>=0;return {matches:on,media:q,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){}}}return o(q)}})();`;
const REFERRER = r => `Object.defineProperty(document,'referrer',{get:function(){return '${r}'}});`;

async function normalCase(key, opts, why) {
  console.log('\n— ' + key + (why ? ' (' + why + ')' : ''));
  const p = await load(UA[key], opts);
  try {
    const s = await state(p);
    check(!s.inApp && !s.open && !s.navs.length, 'no sale nada', { inApp: s.inApp, open: s.open, navs: s.navs });
  } finally { await p.close(); }
}

async function rotateCase(key, exp) {
  console.log('\n— ' + key + ': «Gira el móvil» en partido');
  // jugador que ya dijo «Seguir aquí»: partido de verdad (con ?debug= el telón de arranque se queda encima) empezado en vertical
  const p = await load(UA[key], { init: "try{localStorage.setItem('make-the-cut.inapp','1');localStorage.setItem('make-the-cut.install','1')}catch(e){}", wait: 2600 });
  try {
    const vis = sel => p.evalJs(`(function(e){if(!e)return false;var cs=getComputedStyle(e);return !e.closest('[hidden]')&&cs.display!=='none'&&e.getBoundingClientRect().width>0})(document.querySelector(${JSON.stringify(sel)}))`);
    check(!(await p.evalJs('VB.Install.escIsOpen()')), 'con «Seguir aquí» guardado no sale la hoja al arrancar');
    await p.evalJs('VB.ctx.actions.startMatch({})');
    // (1.24.0) en vertical el partido arranca en la previa, quieta con «Gira el móvil para empezar» (ctx.pvIntro): la ayuda sale en
    // #rotPv; con el partido ya en juego, en #rotate (ctx.portraitBlock)
    let t = Date.now(); while (Date.now() - t < 8000 && !(await p.evalJs('VB.ctx.portraitBlock || VB.ctx.pvIntro'))) await sleep(100);
    const pvi = await p.evalJs('!!VB.ctx.pvIntro'), BOX = pvi ? '#rotPv' : '#rotate';
    const ok0 = pvi ? await vis('#intro') : (await p.evalJs('VB.ctx.portraitBlock') && await vis('#rotate'));
    check(ok0, '«Gira el móvil» a la vista en vertical (' + (pvi ? 'previa del partido' : 'en juego') + ')');
    await sleep(1500);
    check(!(await vis(BOX + ' .rot-help')), 'antes de los 4 s, sin ayuda');
    await sleep(3200);
    check(await vis(BOX + ' .rot-help'), 'a los ~4 s sale la ayuda');
    const txt = await p.evalJs("(document.querySelector('" + BOX + " .rot-help')||{}).textContent||''");
    check(exp.re.test(txt), 'texto: ' + exp.re, txt);
    await p.shot(path.join(OUT, key + '-girar.png'));
    if (exp.btn) {
      const hit = await p.evalJs(`(function(){var b=document.querySelector('${BOX} [data-rh="open"]');if(!b)return 'sin botón';var r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return (r.height>=44&&e&&b.contains(e))?'ok':'tapado por '+(e&&(e.id||e.className))})()`);
      check(hit === 'ok', 'el botón «Abrir en el navegador» se puede tocar (>= 44 px, sin nada encima)', hit);
      await click(p, BOX + ' [data-rh="open"]'); await sleep(300);
      const s = await state(p);
      check(s.open && s.navs.length === 1 && s.navs[0][0] === (exp.btn === 'intent' ? s.L.intent : s.L.ig), 'abre la hoja e intenta con ese toque', s.navs);
      await p.shot(path.join(OUT, key + '-girar-hoja.png'));
      await click(p, '#inappHelp [data-ia="stay"]'); await sleep(200);
    }
    const anyHelp = async () => (await vis('#rotate .rot-help')) || (await vis('#rotPv .rot-help'));
    await p.setSize('844x390', true); await sleep(900);
    check(!(await vis('#rotate')) && !(await anyHelp()), 'al girar a horizontal se va');
    await p.setSize('390x844', true); await sleep(1200);
    check(!(await anyHelp()), 'al volver a vertical, la ayuda espera otra vez');
    await sleep(3600);
    check(await anyHelp(), 'y a los ~4 s vuelve a salir');
  } finally { await p.close(); }
}

(async () => {
  // 1-4) hoja al arrancar
  await inAppCase('igIOS', { app: 'ig', appName: 'Instagram', method: 'ig' });
  await inAppCase('igAnd', { app: 'ig', appName: 'Instagram', method: 'intent', auto: true });
  await inAppCase('fbIOS', { app: 'fb', appName: 'Facebook', method: 'safariWin' });
  await inAppCase('fbAnd', { app: 'fb', appName: 'Facebook', method: 'intent', auto: true });
  await inAppCase('ttIOS', { app: 'tt', appName: 'TikTok', method: '' });
  await inAppCase('ttAnd', { app: 'tt', appName: 'TikTok', method: 'intent' });
  await inAppCase('waAnd', { app: '', method: 'intent' });
  await normalCase('chrome');
  await normalCase('safari');
  await normalCase('chrome', { init: MEDIA('fullscreen') }, 'app de Android: TWA, display-mode fullscreen');
  await normalCase('igAnd', { init: MEDIA('standalone') }, 'Instagram + display-mode standalone (web instalada)');
  await normalCase('igAnd', { init: REFERRER('android-app://com.takethecourt.app') }, 'Instagram + referrer de la TWA');
  await normalCase('waAnd', { init: REFERRER('android-app://com.takethecourt.app') }, 'WebView + referrer de la TWA');
  // sin Chrome: la dirección de reserva vuelve con ttc_ia=nochrome
  console.log('\n— igAnd con ttc_ia=nochrome (no había Chrome)');
  {
    const p = await load(UA.igAnd, { q: Q + '&ttc_ia=nochrome' });
    try {
      const s = await state(p);
      check(s.open && s.L.method === 'intentAny', 'sale la hoja con el intent sin package', s.L.method);
      check(s.navs.length === 0, 'sin intento automático (no hay bucle)', s.navs);
      check(s.search === '?' + Q && s.L.https === HTTPS, 'la marca se quita de la dirección', s.search);
      await click(p, '#inappHelp [data-ia="open"]'); await sleep(200);
      const s2 = await state(p);
      check((s2.navs[0] || [])[0] === s.L.intentAny, 'al tocar, intent sin package', s2.navs);
    } finally { await p.close(); }
  }
  // 5) «Gira el móvil»
  await rotateCase('igAnd', { re: /Abrir en el navegador/, btn: 'intent' });
  await rotateCase('igIOS', { re: /Abrir en el navegador/, btn: 'ig' });
  await rotateCase('chrome', { re: /bloqueo de rotación.*Rotación automática/ });
  await rotateCase('safari', { re: /bloqueo de rotación.*candado/ });
  console.log('\n' + (fails ? fails + ' FALLOS' : 'todo bien'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
