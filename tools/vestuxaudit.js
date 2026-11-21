#!/usr/bin/env node
/* TAKE THE COURT — tools/vestuxaudit.js (auditoría de UI/UX del Vestuario, solo lectura: no toca js/ ni el guardado)
 * Un solo Chrome. Por tamaño (568x320, 640x360, 360x640 táctiles + 1280x720 sin táctil) × sede (hall|beach) × pestaña:
 * ?debug=look&tab=&venue=&item=<objeto de muestra>, captura y métricas (JSON): caja del muñeco en pantalla (cabeza, pies,
 * manos), si la UI tapa la cabeza / los pies (elementFromPoint), filas visibles vs totales, recortes de texto, letra mínima.
 * Extras por tamaño: espalda y perfil (pelo/cabeza), «Probar» (pose), menú «⋯» en móvil, objeto bloqueado.
 * Uso: node tools/vestuxaudit.js [salida=tools/out/vestux] [--sizes=568x320:t,640x360:t,360x640:t,1280x720:d]
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const args = process.argv.slice(2);
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || path.join(CDP.ROOT, 'tools', 'out', 'vestux'));
const SZ = (args.find(a => a.startsWith('--sizes=')) || '--sizes=568x320:t,640x360:t,360x640:t,1280x720:d').slice(8).split(',');
const WAIT = +(process.env.WAIT || 3200);
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 40 * 60e3).unref();
const ITEMS = {
  hall: { pelo: 'coleta', cabeza: 'cinta', cara: 'rayas', cuerpo: 'termica', brazos: 'manguitoRayas', piernas: 'altosRayas', colores: '' },
  beach: { pelo: 'trenzas', cabeza: 'gorra', cara: 'zinc', cuerpo: 'licra', brazos: 'mitones', piernas: 'escarpines', colores: '' }
};
const MEASURE = `(function(){
  var o={}, W=innerWidth, H=innerHeight; o.vw=W; o.vh=H;
  try{
    var P=VB.Doll.preview, inf=P.info(), r=inf&&inf.rig, cam=VB.ctx.camera; o.frame=inf&&inf.frame; o.lod=inf&&inf.lod; o.tris=inf&&inf.tris;
    if(r&&cam){ r.root.updateMatrixWorld(true);
      var V=new THREE.Vector3();
      function pr(b,y){ V.set(0,y||0,0); b.localToWorld(V); V.project(cam); return [Math.round((V.x+1)/2*W), Math.round((1-V.y)/2*H)]; }
      o.head=pr(r.head,0.25); o.headTop=pr(r.head,0.42);
      if(r.ft){ o.footL=pr(r.ft[0],0); o.footR=pr(r.ft[1],0); }
      if(r.hand){ o.handL=pr(r.hand[0],0); o.handR=pr(r.hand[1],0); }
      function who(p){ if(!p) return 'n/a'; if(p[0]<0||p[1]<0||p[0]>=W||p[1]>=H) return 'FUERA'; var e=document.elementFromPoint(p[0],p[1]); if(!e) return 'nada'; if(e.tagName==='CANVAS'||e.id==='lkSpin') return 'lienzo'; var c=e.className&&e.className.baseVal!=null?e.className.baseVal:e.className; return (e.id||'')+'.'+String(c||'').split(' ').slice(0,2).join('.')+' <'+e.tagName.toLowerCase()+'>'; }
      o.cover={ head:who(o.head), headTop:who(o.headTop), footL:who(o.footL), footR:who(o.footR), handL:who(o.handL), handR:who(o.handR) };
      if(o.headTop&&o.footL) o.dollPx=Math.abs(o.footL[1]-o.headTop[1]);
    }
  }catch(e){ o.err=String(e); }
  var L=document.getElementById('lkList'); if(L){ var lr=L.getBoundingClientRect(); o.list={h:Math.round(lr.height), sh:L.scrollHeight, rows:L.querySelectorAll('[data-look]').length, vis:0};
    L.querySelectorAll('[data-look]').forEach(function(b){ var br=b.getBoundingClientRect(); if(br.top>=lr.top-1&&br.bottom<=lr.bottom+1) o.list.vis++; }); }
  var cut=[], small={};
  document.querySelectorAll('#mpLook *, #lkSpin *').forEach(function(e){ if(!e.getClientRects().length) return; var cs=getComputedStyle(e);
    if(e.children.length===0&&e.textContent.trim()){ var fs=parseFloat(cs.fontSize); if(fs<13) small[fs]=(small[fs]||0)+1;
      if(e.scrollWidth>e.clientWidth+1&&(cs.overflow!=='visible'||cs.textOverflow==='ellipsis')) cut.push(e.textContent.trim().slice(0,40)); }
    var r=e.getBoundingClientRect(); if((r.right>W+1||r.left<-1)&&e.closest('#mpLook')&&r.width>4) cut.push('FUERA-X:'+(e.id||String(e.className)));
  });
  o.cut=cut.slice(0,12); o.smallFont=small;
  o.tabs=[]; document.querySelectorAll('#lkTabs .tab').forEach(function(t){ var r=t.getBoundingClientRect(); o.tabs.push([t.textContent.trim(), Math.round(r.width), Math.round(r.height), r.right<=W+1&&r.left>=-1]); });
  o.foot=[]; document.querySelectorAll('#lkFoot [data-lkf]').forEach(function(b){ if(b.getClientRects().length){ var r=b.getBoundingClientRect(); o.foot.push([b.getAttribute('data-lkf'), Math.round(r.width)+'x'+Math.round(r.height)]); } });
  o.rot=[]; document.querySelectorAll('.lk-rot button').forEach(function(b){ var r=b.getBoundingClientRect(); o.rot.push([Math.round(r.left),Math.round(r.top),Math.round(r.width)]); });
  o.rowsTxt=[]; document.querySelectorAll('#lkList [data-look]').forEach(function(b){ o.rowsTxt.push(b.innerText.replace(/\\s+/g,' ').trim().slice(0,100)); });
  return JSON.stringify(o);
})()`;
(async () => {
  let page; const all = {};
  try {
    for (const s of SZ) {
      const [size, kind] = s.split(':'), touch = kind !== 'd';
      if (!page) page = await CDP.open({ size, touch }); else await page.setSize(size, touch);
      const dir = path.join(OUT, size); fs.mkdirSync(dir, { recursive: true });
      for (const ven of ['hall', 'beach']) for (const tab of Object.keys(ITEMS[ven])) {
        const it = ITEMS[ven][tab];
        const id = ven + '-' + tab + (it ? '-' + it : '');
        await page.navigate('debug=look&tab=' + tab + '&venue=' + ven + (it ? '&item=' + it : ''));
        await CDP.sleep(WAIT);
        await page.shot(path.join(dir, id + '.png'));
        let m = {}; try { m = JSON.parse(await page.evalJs(MEASURE)); } catch (e) { m = { err: e.message }; }
        all[size + '/' + id] = m;
        console.log(size, id, 'doll', m.dollPx, 'frame', m.frame, JSON.stringify(m.cover || {}), 'rows', m.list && m.list.vis + '/' + m.list.rows, m.err || '');
        if (tab === 'pelo' || tab === 'cabeza') {   // espalda y perfil
          await page.evalJs('VB.Doll.preview.yaw(Math.PI)'); await CDP.sleep(300);
          await page.shot(path.join(dir, id + '-espalda.png'));
          await page.evalJs('VB.Doll.preview.yaw(Math.PI/2)'); await CDP.sleep(300);
          await page.shot(path.join(dir, id + '-perfil.png'));
        }
      }
      await page.navigate('debug=look&tab=pelo&venue=hall'); await CDP.sleep(WAIT);
      await page.evalJs("(function(){var b=document.querySelector('#lkFoot [data-lkf=try]'); b&&b.click();})()"); await CDP.sleep(900);
      await page.shot(path.join(dir, 'probar.png'));
      const more = await page.evalJs("(function(){var b=document.querySelector('#lkFoot [data-lkf=more]'); if(b&&b.getClientRects().length){b.click();return 1}return 0})()");
      if (more) { await CDP.sleep(600); await page.shot(path.join(dir, 'mas.png')); }
      await page.navigate('debug=look&item=cresta'); await CDP.sleep(WAIT);
      await page.shot(path.join(dir, 'bloqueado-cresta.png'));
      try { all[size + '/bloqueado'] = JSON.parse(await page.evalJs(MEASURE)); } catch (e) { }
      await page.navigate('debug=look&tab=colores&venue=hall'); await CDP.sleep(WAIT);
      await page.evalJs("(function(){var L=document.getElementById('lkList'); L.scrollTop=L.scrollHeight;})()"); await CDP.sleep(300);
      await page.shot(path.join(dir, 'colores-abajo.png'));
    }
  } catch (e) { console.error('ERROR', e && e.stack || e); }
  if (page) await page.close();
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(all, null, 1));
  console.log('->', OUT);
  process.exit(0);
})();
