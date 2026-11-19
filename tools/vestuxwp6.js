#!/usr/bin/env node
/* MAKE THE CUT — tools/vestuxwp6.js (WP6 del plan del Vestuario: comprobación de la interfaz, solo lectura)
 * Un solo Chrome. Por tamaño (568x320, 640x360 y 360x640 táctiles; 1280x720 de PC) captura en JPEG los casos de WP6 y mide:
 *  - lista de Pelo, rejilla de peinados (miniaturas), rejilla de color de pelo, tobillera (encuadre de pies), coleta (se asoma a la
 *    espalda), brazo izquierdo, colores (qué pinta cada fila), bloqueado (cresta), hoja «⋯», «Probar», Vestuario de playa (fondo);
 *  - en cada caso: cabeza, pies y manos del muñeco tapados o no por la UI (elementFromPoint), ⟲ ↻ ⟳ y acciones sin tapar, las 7
 *    pestañas visibles, letra mínima (< 13 px en el móvil = fallo), recortes, encuadre y giro de la vista previa;
 *  - miniaturas: ms por retrato pintado (ctx.portraitInfo) y el peor frame mientras se generan.
 * Uso: node tools/vestuxwp6.js [--sizes=568x320:t,...] [--only=caso,caso] [salida=tools/out/vestux-wp6]
 * Salida: <salida>/<tamaño>/<caso>.jpg y <salida>/metrics.json (resumen por consola).
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const args = process.argv.slice(2);
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(CDP.ROOT, 'tools', 'out', 'vestux-wp6'));
const SZ = (args.find(a => a.startsWith('--sizes=')) || '--sizes=568x320:t,640x360:t,360x640:t,1280x720:d').slice(8).split(',');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const WAIT = +(process.env.WAIT || 3000);
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 30 * 60e3).unref();

const MEASURE = `(function(){
  var o={}, W=innerWidth, H=innerHeight, ph=document.documentElement.classList.contains('ph'); o.ph=ph;
  function who(p){ if(!p) return 'n/a'; if(p[0]<0||p[1]<0||p[0]>=W||p[1]>=H) return 'FUERA'; var e=document.elementFromPoint(p[0],p[1]); if(!e) return 'nada';
    if(e.tagName==='CANVAS'||e.id==='lkSpin'||e.id==='menu'||e.classList.contains('screen')) return 'ok'; return 'TAPA:'+(e.id||String(e.className&&e.className.baseVal!=null?e.className.baseVal:e.className).split(' ').slice(0,2).join('.'))+'<'+e.tagName.toLowerCase()+'>'; }
  try{
    var P=VB.Doll.preview, inf=P.info(), r=inf&&inf.rig, cam=VB.ctx.camera; o.frame=inf&&inf.frame; o.yaw=inf&&+(((inf.yaw%6.2832)+6.2832)%6.2832).toFixed(2); o.lod=inf&&inf.lod; o.tris=inf&&inf.tris;
    if(r&&cam){ r.root.updateMatrixWorld(true); var V=new THREE.Vector3();
      function pr(b,y){ V.set(0,y||0,0); b.localToWorld(V); V.project(cam); return [Math.round((V.x+1)/2*W), Math.round((1-V.y)/2*H)]; }
      o.pt={ head:pr(r.head,0.25), headTop:pr(r.head,0.42), footL:pr(r.ft[0],0), footR:pr(r.ft[1],0), handL:pr(r.hand[0],0), handR:pr(r.hand[1],0), knee:pr(r.kn[0],0) };
      // solo lo que el encuadre enseña (de cerca, los pies o la cabeza quedan fuera a propósito; en vertical, detrás de la lista)
      var F=o.frame, sees={ head: !/^(pies|rodillas|piernas)$/.test(F), feet: /^(cuerpo|piernas|pies)$/.test(F), hands: /^(cuerpo|brazos|brazoL|brazoR|manos)$/.test(F) };
      o.cover={}; for(var k in o.pt){ var g=/^head/.test(k)?'head':/^foot/.test(k)?'feet':/^hand/.test(k)?'hands':''; if(g&&sees[g]) o.cover[k]=who(o.pt[k]); }
      o.dollPx=Math.abs(o.pt.footL[1]-o.pt.headTop[1]);
    }
  }catch(e){ o.err=String(e); }
  var small={}, cut=[];
  document.querySelectorAll('#mpLook *, #lkSpin *, #spSheets *').forEach(function(e){ if(!e.getClientRects().length) return; var cs=getComputedStyle(e); if(cs.visibility==='hidden') return;
    var direct=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim();});
    if(direct){ var fs=parseFloat(cs.fontSize); if(fs<13) small[fs]=(small[fs]||0)+1+':'+e.textContent.trim().slice(0,18);
      if(e.scrollWidth>e.clientWidth+1&&(cs.overflow!=='visible'||cs.textOverflow==='ellipsis')) cut.push(e.textContent.trim().slice(0,30)); }
    var b=e.getBoundingClientRect(); if((b.right>W+1||b.left<-1||b.bottom>H+1)&&b.width>4&&!e.closest('.lk-gbody,#lkList,.lk-fams')) cut.push('FUERA:'+(e.id||String(e.className).slice(0,30)));
  });
  o.small=small; o.cut=cut.slice(0,10);
  o.tabs=[].map.call(document.querySelectorAll('#lkTabs .tab'),function(t){var b=t.getBoundingClientRect(),c=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return b.width&&b.right<=W+1&&b.left>=-1&&(c===t||t.contains(c))?1:0;}).join('');
  o.btns=[].map.call(document.querySelectorAll('#lkFoot [data-lkf], .lk-rot [data-rot]'),function(b){ if(!b.getClientRects().length) return null; var r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return (b.getAttribute('data-lkf')||b.getAttribute('data-rot'))+(e===b||b.contains(e)?'':'!TAPADO'); }).filter(Boolean).join(' ');
  var G=document.getElementById('lkGrid'); if(G&&!G.hidden){ o.grid={tiles:G.querySelectorAll('.lk-tile').length, imgs:G.querySelectorAll('.lk-ti img:not([hidden])').length, vis:0};
    var gb=G.querySelector('.lk-gbody'), gr=gb&&gb.getBoundingClientRect(); if(gr) G.querySelectorAll('.lk-tile').forEach(function(t){var b=t.getBoundingClientRect(); if(b.top>=gr.top-2&&b.bottom<=gr.bottom+2) o.grid.vis++;}); }
  o.rows=[].map.call(document.querySelectorAll('#lkList [data-look]'),function(b){return b.innerText.replace(/\\s+/g,' ').trim().slice(0,90);});
  try{ o.pt2=VB.ctx.portraitInfo(); }catch(e){}
  o.venueScene=VB.Arena&&VB.Arena.venue?VB.Arena.venue():'';
  return JSON.stringify(o);
})()`;
const CLICK = sel => `(function(){var b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 0; b.click(); return 1;})()`;
// (Chrome sin ventana con foco no lanza focusin al enfocar: se lanza a mano, como el de un teclado de verdad)
// casos: [id, url (sin debug=look), pasos (JS tras cargar), espera ms tras los pasos]
const CASES = [
  ['pelo', 'tab=pelo&venue=hall', [], 0],
  ['rejilla-peinado', 'tab=pelo&venue=hall', [CLICK('[data-look="style"]')], 2200],
  ['rejilla-pelo', 'tab=pelo&venue=hall', [CLICK('[data-look="hair"]')], 900],
  ['coleta', 'tab=pelo&venue=hall', [CLICK('[data-look="style"]'), CLICK('[data-lkv="1"]')], 700],
  ['cabeza', 'tab=cabeza&venue=hall&item=gorraMTC', [], 0],
  ['brazoL', 'tab=brazos&venue=hall&item=manguitoRayas', [`(function(){var b=document.querySelector('[data-look="armL"]'); if(b){b.focus(); b.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));} return 1})()`], 900],
  ['tobillera', 'tab=piernas&venue=beach&item=tela', [`(function(){var b=document.querySelector('[data-look="ankle"]'); if(b){b.focus(); b.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));} return 1})()`], 900],
  ['colores', 'tab=colores&venue=hall&item=manguitoRayas', [], 0],
  ['bloqueado', 'tab=pelo&venue=hall&item=cresta', [], 0],
  ['bloqueado-rejilla', 'tab=pelo&venue=hall&item=cresta', [CLICK('[data-look="style"]')], 1800],
  ['mas', 'tab=pelo&venue=hall', [CLICK('#lkFoot [data-lkf="more"]')], 700],
  ['probar', 'tab=pelo&venue=hall', [CLICK('#lkFoot [data-lkf="try"]')], 1100],
  ['playa', 'tab=cuerpo&venue=beach&item=licra', [], 1500],
  ['vuelta', 'tab=cuerpo&venue=hall', [CLICK('.lk-rot [data-rot="turn"]')], 900],
  ['cara', 'tab=cara&venue=hall&item=rayas', [], 0],
  ['aviso-tobillera', 'tab=piernas&venue=hall&item=altos', [], 0]
];
(async () => {
  let page; const all = {};
  try {
    for (const s of SZ) {
      const [size, kind] = s.split(':'), touch = kind !== 'd';
      if (!page) page = await CDP.open({ size, touch }); else await page.setSize(size, touch);
      const dir = path.join(OUT, size); fs.mkdirSync(dir, { recursive: true });
      for (const [id, url, steps, wait] of CASES) {
        if (ONLY.length && !ONLY.includes(id)) continue;
        await page.navigate('debug=look&' + url); await CDP.sleep(WAIT);
        // peor frame mientras se generan las miniaturas (rAF durante los pasos)
        await page.evalJs(`(function(){window.__lkF=[];var t0=performance.now(),l=t0;function f(t){window.__lkF.push(t-l);l=t;if(t-t0<4000)requestAnimationFrame(f);}requestAnimationFrame(f);})()`);
        for (const st of steps) { await page.evalJs(st); await CDP.sleep(250); }
        await CDP.sleep(wait);
        const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        fs.writeFileSync(path.join(dir, id + '.jpg'), Buffer.from(r.data, 'base64'));
        let m = {}; try { m = JSON.parse(await page.evalJs(MEASURE)); } catch (e) { m = { err: e.message }; }
        try { const fr = JSON.parse(await page.evalJs('JSON.stringify((window.__lkF||[]).slice(2))')); m.frameMax = Math.round(Math.max.apply(null, fr.concat([0]))); m.frames = fr.length; } catch (e) { }
        all[size + '/' + id] = m;
        const bad = Object.keys(m.cover || {}).filter(k => m.cover[k] !== 'ok').map(k => k + '=' + m.cover[k]);
        console.log(size, id.padEnd(18), 'frame', m.frame, 'yaw', m.yaw, 'doll', m.dollPx, 'tabs', m.tabs, '|', m.btns, '| tapado:', bad.join(' ') || '-', '| small', JSON.stringify(m.small), m.cut && m.cut.length ? '| cut ' + m.cut.join(';') : '', m.grid ? '| grid ' + JSON.stringify(m.grid) : '', '| pt', m.pt2 && m.pt2.ms, 'maxF', m.frameMax, m.err || '');
      }
    }
  } catch (e) { console.error('ERROR', e && e.stack || e); }
  if (page) { if (page.errors && page.errors.length) console.log('ERRORES DE LA PÁGINA:', page.errors.slice(0, 10)); await page.close(); }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(all, null, 1));
  console.log('->', OUT);
  process.exit(0);
})();
