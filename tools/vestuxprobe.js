#!/usr/bin/env node
/* MAKE THE CUT — tools/vestuxprobe.js (auditoría del Vestuario, solo lectura)
 * Sondas sueltas en ?debug=look: ¿qué hay encima de los botones ⟲ ⟳ y del muñeco?, ¿se puede arrastrar para girar en vertical?,
 * ¿cuántas pestañas caben en el carril?, espalda de cada peinado (yaw=π) a 640x360 en tools/out/vestux/peinados/.
 * Uso: node tools/vestuxprobe.js
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const OUT = path.join(CDP.ROOT, 'tools', 'out', 'vestux');
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 15 * 60e3).unref();
const PROBE = `(function(){
  var o={}, W=innerWidth, H=innerHeight;
  o.rot=[].map.call(document.querySelectorAll('.lk-rot button'),function(b){var r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,e=document.elementFromPoint(cx,cy);return [Math.round(cx),Math.round(cy),e===b||b.contains(e)?'OK':'TAPADO por '+(e&&(e.id||e.className))];});
  var T=document.getElementById('lkTabs'), tr=T.getBoundingClientRect(); o.tabsBox=[Math.round(tr.left),Math.round(tr.top),Math.round(tr.width),Math.round(tr.height)];
  o.tabsVisible=[].filter.call(T.querySelectorAll('.tab'),function(t){var r=t.getBoundingClientRect();return r.top>=tr.top-1&&r.bottom<=tr.bottom+1&&r.left>=tr.left-1&&r.right<=tr.right+1;}).map(function(t){return t.textContent.trim()});
  var S=document.getElementById('lkSpin'), sr=S.getBoundingClientRect(); o.spin=[Math.round(sr.left),Math.round(sr.top),Math.round(sr.width),Math.round(sr.height)];
  var pts=[[0.75,0.3],[0.75,0.5],[0.5,0.3],[0.5,0.45],[0.85,0.6]]; o.dragAt=pts.map(function(p){var e=document.elementFromPoint(p[0]*W,p[1]*H);return p.join(',')+'='+(e===S||S.contains(e)&&!e.closest('button')?'GIRA':(e&&(e.id||String(e.className).slice(0,30)||e.tagName)));});
  return JSON.stringify(o);
})()`;
(async () => {
  let page;
  try {
    for (const [size, touch] of [['568x320', true], ['360x640', true], ['640x360', true]]) {
      if (!page) page = await CDP.open({ size, touch }); else await page.setSize(size, touch);
      await page.navigate('debug=look&tab=pelo&venue=hall'); await CDP.sleep(3000);
      console.log(size, await page.evalJs(PROBE));
    }
    const dir = path.join(OUT, 'peinados'); fs.mkdirSync(dir, { recursive: true });
    for (const st of ['tupe', 'coleta', 'afro', 'flequillo', 'rapado', 'mono', 'trenzas', 'dosmonos', 'coletas', 'cresta']) {
      await page.navigate('debug=look&tab=pelo&venue=hall&item=' + st); await CDP.sleep(2600);
      await page.shot(path.join(dir, st + '-frente.png'));
      await page.evalJs('VB.Doll.preview.yaw(Math.PI*0.8)'); await CDP.sleep(250);
      await page.shot(path.join(dir, st + '-espalda.png'));
    }
  } catch (e) { console.error('ERROR', e && e.stack || e); }
  if (page) await page.close();
  process.exit(0);
})();
