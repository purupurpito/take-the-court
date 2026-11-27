#!/usr/bin/env node
/* TAKE THE COURT — tools/medidorshot.js (owner: ui_main)
 * Capturas de un diseño del medidor del golpe (js/hitmeter.js, js/hm-<id>.js) para mirarlo, no es una prueba:
 *   PC 1280×720 (pabellón y playa), móvil en horizontal 844×390 y pequeño 667×375 (táctil, dpr 2; en vertical el juego pide girar el móvil), cuatro golpes:
 *   remate perfecto, recepción buena pronto, colocación tarde y defensa floja sin motivo; el sello parado a 330 ms (ya subido,
 *   sin fundir). Más la fila de Ajustes › Juego con la vista previa. Recortes alrededor del sello y una captura entera por tamaño.
 * Uso: node tools/medidorshot.js <id> [carpeta=_shots/medidor]     Escribe <carpeta>/<id>-<tamaño>-<caso>.png
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require(path.join(__dirname, 'cdp.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ID = process.argv[2] || 'bar';
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', '_shots', 'medidor'));
fs.mkdirSync(OUT, { recursive: true });
const CASES = [
  ['remate', { kind: 'spike', touch: 3, grade: 'perfect', quality: 0.95, timing: 0.012 }],
  ['recepcion', { recv: true, grade: 'good', quality: 0.6, timing: -0.08 }],
  ['colocacion', { kind: 'set', touch: 2, grade: 'poor', quality: 0.3, timing: 0.17 }],
  ['defensa', { dig: true, grade: 'poor', quality: 0.4, timing: -0.02 }],
];
const SIZES = [['pc', '1280x720', false, 'debug=rally&quality=high'], ['playa', '1280x720', false, 'debug=rally&quality=high&map=beach'],
  ['horiz', '844x390', true, 'debug=rally&quality=high'], ['peq', '667x375', true, 'debug=rally&quality=high']];
(async () => {
  const written = [], errs = [];
  for (const [tag, size, touch, q] of SIZES) {
    const page = await CDP.open({ size, touch, dpr: touch ? 2 : 1 });
    try {
      await page.evalJs(`try { localStorage.setItem('make-the-cut.settings', JSON.stringify({ hitMeter: ${JSON.stringify(ID)} })); } catch (e) {} 1`);
      await page.navigate(q);
      for (let i = 0; i < 250; i++) { try { if (await page.evalJs('!!(window.VB && VB.ctx && VB.ctx.game && VB.ctx.game.ctrl && VB.ctx.camera && VB.HitMeter)')) break; } catch (e) { } await sleep(100); }
      await sleep(2500);
      await page.evalJs(`VB.ctx.actions.setSetting('hitMeter', ${JSON.stringify(ID)}), 1`);
      for (const [name, o] of CASES) {
        await page.evalJs(`(function(o){
          var g = VB.ctx.game, p = g.ctrl;
          var e = Object.assign({ type: 'hit', kind: 'pass', team: 0, player: p, touch: 1, quality: 0.6, grade: 'good', timing: 0, human: true,
            x: p.x, y: p.y, z: 2.2, speed: 8, shot: '', dive: false, recv: false, dig: false, jset: false, feint: false, chain: 0, mom: 0, pipe: false,
            strK: 0, reachK: 0.3, inSp: 0, prevQ: 1 }, o);
          VB.UI.update(g, 0, [e]);
          document.querySelector('#stamp .st-in').getAnimations().forEach(function (x) { x.pause(); x.currentTime = 330; });
          return 1;
        })(${JSON.stringify(o)})`);
        await sleep(300);
        const r = JSON.parse(await page.evalJs(`JSON.stringify((function(){ var r = document.querySelector('#stamp .st-in').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, W: innerWidth, H: innerHeight }; })())`));
        const pad = 60, x = Math.max(0, r.x - pad * 1.5), y = Math.max(0, r.y - pad), w = Math.min(r.W - x, r.w + pad * 3), h = Math.min(r.H - y, r.h + pad * 2);
        const f = path.join(OUT, `${ID}-${tag}-${name}.png`);
        await page.shot(f, { x, y, width: w, height: h }); written.push(f);
        if (name === 'recepcion') { const f2 = path.join(OUT, `${ID}-${tag}-entera.png`); await page.shot(f2); written.push(f2); }
      }
      if (page.errors && page.errors.length) errs.push(tag + ': ' + page.errors.slice(0, 3).join(' | '));
    } finally { await page.close(); }
  }
  // vista previa en Ajustes › Juego
  const page = await CDP.open({ size: '1280x720' });
  try {
    await page.evalJs(`try { localStorage.setItem('make-the-cut.settings', JSON.stringify({ hitMeter: ${JSON.stringify(ID)} })); } catch (e) {} 1`);
    await page.navigate('debug=settings&panel=set&nonews=1');
    for (let i = 0; i < 200; i++) { try { if (await page.evalJs('!!(window.VB && VB.UI && VB.UI._settings && document.getElementById("setTabs-game"))')) break; } catch (e) { } await sleep(100); }
    await sleep(1200);
    await page.evalJs(`document.getElementById('setTabs-game').click(), VB.ctx.actions.setSetting('hitMeter', ${JSON.stringify(ID)}), 1`);
    await sleep(500);
    const r = JSON.parse(await page.evalJs(`JSON.stringify((function(){ var b = document.querySelector('[data-opt="hitMeter"]'); b.scrollIntoView({ block: 'center' }); var r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })())`));
    await sleep(300);
    const r2 = JSON.parse(await page.evalJs(`JSON.stringify((function(){ var r = document.querySelector('[data-opt="hitMeter"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })())`));
    const f = path.join(OUT, `${ID}-ajustes.png`);
    await page.shot(f, { x: Math.max(0, r2.x - 10), y: Math.max(0, r2.y - 10), width: r2.w + 20, height: r2.h + 20 }); written.push(f);
    if (page.errors && page.errors.length) errs.push('ajustes: ' + page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
  console.log(written.join('\n'));
  if (errs.length) { console.log('ERRORES JS:\n' + errs.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
