#!/usr/bin/env node
/* TAKE THE COURT — tools/girotest.js (owner: ui_main). Ronda 2 del móvil (notes/movil-aire.md §8.2 y §8.6.1): girar el móvil en caliente
 * (390x844 <-> 844x390, táctil): html.pv / html.ph, VB.Splat.mob()/pv()/phone(), vb:ph con {ph, pv, mob, …}, la cuenta y crear jugador
 * conservan lo escrito, la Carrera se ve en vertical sin «Gira el móvil» (PH = mob: sobre de Mensajes; PHL = apaisado: raíl) y se
 * repinta al girar, la sala online sigue, y VB.Splat.sheet() en vertical es .pv-sheet con velo e inert. Uso: node tools/girotest.js */
'use strict';
const CDP = require('./cdp.js');
const PG = require('./mobaudit-page.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const p = await CDP.open({ size: '390x844', touch: true, dpr: 1, init: ["if(/[?&]ma_clean=1/.test(location.search)){try{localStorage.clear()}catch(e){}}"] });
  await p.send('Emulation.setUserAgentOverride', { userAgent: CDP.ANDROID_UA, platform: 'Linux armv8l' });
  const out = [];
  const ok = (c, m) => { out.push((c ? 'ok   ' : 'FALLO ') + m); };
  try {
    await p.navigate('ma_clean=1&uianim=0&debug=menu&online=1&olmock=1');
    await p.evalJs(`new Promise(res=>{const t0=Date.now();(function f(){try{if(window.VB&&VB.UI&&VB.UI._boot&&VB.UI._boot().stage>=2)return res(1)}catch(e){} if(Date.now()-t0>20000)return res(0); setTimeout(f,100)})()})`, true);
    await sleep(600);
    await p.evalJs('(' + PG.helpers.toString() + ')()');
    await p.evalJs("window.__ev=[];document.addEventListener('vb:ph',function(e){__ev.push(['ph',JSON.stringify(e.detail)])});document.addEventListener('vb:tier',function(e){__ev.push(['tier',JSON.stringify(e.detail)])});");
    let cls = await p.evalJs("document.documentElement.className");
    ok(/\bpv\b/.test(cls) && !/\bph\b/.test(cls), 'vertical: html.pv sin .ph (' + cls + ')');
    ok(await p.evalJs("VB.Splat.mob()===true && VB.Splat.pv()===true && VB.Splat.phone()===false"), 'mob()/pv()/phone() en vertical');
    ok(await p.evalJs("VB.Splat.cutWords('Tranquilidad, tu momento llegará. Pero si quieres', 30)") === 'Tranquilidad, tu momento…', 'cutWords corta por palabra: ' + await p.evalJs("VB.Splat.cutWords('Tranquilidad, tu momento llegará. Pero si quieres', 30)"));
    // cuenta: escribir y girar
    await p.evalJs("(async()=>{await __MA.ensureMenu(); VB.Account._preview('enter',{tab:'new'}); })()", true); await sleep(300);
    await p.evalJs("var u=document.querySelector('#acUser'); if(u){u.value='girador7'; u.dispatchEvent(new Event('input',{bubbles:true}));} var q=document.querySelector('#acPass'); if(q) q.value='secreto123';");
    await p.setSize('844x390', true, 1); await sleep(700);
    cls = await p.evalJs("document.documentElement.className");
    ok(/\bph\b/.test(cls) && !/\bpv\b/.test(cls), 'apaisado: html.ph sin .pv (' + cls + ')');
    const ev = await p.evalJs("JSON.stringify(__ev)");
    ok(/"ph"/.test(ev) && /\\"pv\\":false/.test(ev) && /\\"mob\\":true/.test(ev), 'vb:ph al girar con {ph, pv, mob, …}: ' + ev.slice(0, 160));
    ok(await p.evalJs("(document.querySelector('#acUser')||{}).value") === 'girador7' && await p.evalJs("(document.querySelector('#acPass')||{}).value") === 'secreto123', 'cuenta: el usuario y la contraseña siguen tras girar a apaisado');
    await p.setSize('390x844', true, 1); await sleep(700);
    ok(await p.evalJs("(document.querySelector('#acUser')||{}).value") === 'girador7', 'cuenta: siguen tras volver a vertical');
    await p.evalJs("VB.Account.close()");
    // Carrera: abrir en vertical (sin aviso de girar) y girar
    ok(await p.evalJs("(async()=>{ if(!__MA.seedCareer('beach')) return false; return await __MA.career('match'); })()", true), 'Carrera abierta en vertical');
    await sleep(300);
    ok(await p.evalJs("document.getElementById('rotate').hidden === true"), 'Carrera en vertical: sin «Gira el móvil»');
    ok(await p.evalJs("!!document.querySelector('#career .cr-mail')"), 'Carrera en vertical: Mensajes en el sobre (PH = mob)');
    ok(await p.evalJs("!document.querySelector('#crTabs.sp-vtabs')"), 'Carrera en vertical: sin raíl (PHL = apaisado)');
    await p.setSize('844x390', true, 1); await sleep(700);
    ok(await p.evalJs("!!document.querySelector('#crTabs.sp-vtabs') && !!document.querySelector('#career .cr-mail')"), 'Carrera al girar a apaisado: raíl y sobre');
    await p.setSize('390x844', true, 1); await sleep(700);
    ok(await p.evalJs("!document.querySelector('#crTabs.sp-vtabs') && document.getElementById('rotate').hidden"), 'Carrera al volver a vertical: sin raíl ni aviso');
    // (ronda 2, carrera-marco-v) marco vertical: barra de 5 apartados abajo, tira de arriba, cabecera de dos niveles; girar conserva la pestaña
    await p.evalJs("VB.CareerUI._tab('league','cal')"); await sleep(300);
    const fr = () => p.evalJs("(function(){var t=document.getElementById('crTabs'),s=document.getElementById('crSub'),r=t.getBoundingClientRect(),on=t.querySelector('.tab.on');return JSON.stringify({tbar:t.classList.contains('pv-tbar'),vt:t.classList.contains('sp-vtabs'),bottom:Math.round(innerHeight-r.bottom),top:Math.round(r.top),n:t.querySelectorAll('.tab').length,on:on&&on.getAttribute('data-tab'),sub:(s.querySelector('.tab.on')||{}).textContent||'',strip:s.classList.contains('pv-tstrip'),cv:document.getElementById('crBody').getAttribute('data-cv'),hd:Math.round(document.querySelector('#career .cr-head').getBoundingClientRect().height),cl:(document.querySelector('#career .cr-title small')||{}).textContent||''})})()");
    let f1 = JSON.parse(await fr());
    ok(f1.tbar && !f1.vt && f1.bottom <= 1 && f1.n === 5 && f1.on === 'league', 'Carrera vertical: barra de 5 apartados abajo con Liga elegida: ' + JSON.stringify(f1));
    ok(f1.strip && /Jornadas/.test(f1.sub) && f1.hd <= 120 && /^T\d+ · .+ · .+/.test(f1.cl), 'Carrera vertical: tira de arriba (Jornadas) y cabecera compacta (≤ 120 px, «T1 · liga · club»)');
    await p.setSize('844x390', true, 1); await sleep(700);
    let f2 = JSON.parse(await fr());
    ok(f2.vt && !f2.tbar && f2.cv === 'league-cal', 'Carrera al girar a apaisado: raíl y la misma pestaña (Liga › Jornadas): ' + JSON.stringify(f2));
    await p.setSize('390x844', true, 1); await sleep(700);
    let f3 = JSON.parse(await fr());
    ok(f3.tbar && !f3.vt && f3.cv === 'league-cal' && f3.bottom <= 1, 'Carrera al volver a vertical: barra abajo y Liga › Jornadas sigue');
    ok(await p.evalJs("!!document.getElementById('careerPvCopy') && document.getElementById('careerPvCopy').textContent.length > 1000"), 'Carrera vertical: contenido del móvil copiado de .ph (careerPvCopy)');
    await p.evalJs("VB.CareerUI._tab('match')"); await sleep(300);
    // Carrera: nombre a medio escribir en crear jugador
    await p.evalJs("(async()=>{await __MA.ensureMenu(); VB.CareerUI.open('create',{from:'main'});})()", true); await sleep(300);
    await p.evalJs("var n=document.querySelector('#crName'); if(n){n.value='Nadia Giro'; n.dispatchEvent(new Event('input',{bubbles:true}));}");
    await p.setSize('844x390', true, 1); await sleep(700);
    ok(await p.evalJs("(document.querySelector('#crName')||{}).value") === 'Nadia Giro', 'crear jugador: el nombre sigue tras girar');
    await p.setSize('390x844', true, 1); await sleep(700);
    ok(await p.evalJs("(document.querySelector('#crName')||{}).value") === 'Nadia Giro', 'crear jugador: sigue tras volver a vertical');
    // sala online
    ok(await p.evalJs("(async()=>{ await __MA.ensureMenu(); return await __MA.online('room'); })()", true), 'sala online en vertical');
    await p.setSize('844x390', true, 1); await sleep(800);
    ok(await p.evalJs("VB.NetLobby._state().view==='room' && !!document.querySelector('#mpOnline .ol-hr, #mpOnline')"), 'sala online: sigue en la sala tras girar');
    // hoja (sheet) en vertical: .pv-sheet + velo + inert; en apaisado sin
    await p.setSize('390x844', true, 1); await sleep(600);
    await p.evalJs("VB.Splat.sheet({title:'Prueba', html:'<p>Hola</p>'})");
    ok(await p.evalJs("!!document.querySelector('#spSheets .sp-sheet.pv-sheet') && !!document.querySelector('#spSheets .sp-catch.pv-veil') && !document.querySelector('#spSheets .sp-dock')"), 'hoja en vertical: .pv-sheet, velo y sin «Cerrar» al pie');
    ok(await p.evalJs("[].some.call(document.getElementById('app').children,function(c){return c.hasAttribute('inert')})"), 'hoja en vertical: lo de detrás inert');
    await p.evalJs("VB.Splat.closeTop()");
    ok(await p.evalJs("![].some.call(document.getElementById('app').children,function(c){return c.hasAttribute('inert')})"), 'hoja cerrada: nada inert');
    const errs = p.errors.slice(0, 5);
    ok(!errs.length, 'sin errores JS' + (errs.length ? ': ' + JSON.stringify(errs) : ''));
  } catch (e) { out.push('FALLO excepción: ' + (e.stack || e)); }
  finally { p.close(); }
  console.log(out.join('\n'));
  const nf = out.filter(x => /^FALLO/.test(x)).length;
  console.log(nf ? nf + ' fallos' : 'TODO OK (' + out.length + ')');
  process.exit(nf ? 1 : 0);
})();
