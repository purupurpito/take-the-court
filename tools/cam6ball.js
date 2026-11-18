#!/usr/bin/env node
/* MAKE THE CUT — tools/cam6ball.js  (owner: camera_input)
 * ¿Se ve el balón en el 6 contra 6 con humano? (17-nov-2026, pedido de Ferran: «hay veces que no ves lo que está pasando con el balón»).
 * Juega un partido 6v6 EN VIVO con la cámara de 3ª persona y mide, frame a frame (plano 'tp', peloteo y saque):
 *   - balón dentro del CUADRO SEGURO (|x|, |y| NDC <= SAFE, 0,85 por defecto), al borde (SAFE..1), fuera (> 1) o detrás de la cámara
 *   - balón TAPADO por un atleta (el rayo cámara-balón pasa a < 0,28 m del cuerpo de alguien más cerca que el balón)
 *   - tamaño del balón en pantalla (px de diámetro; p5 por fase)
 *   - tu jugador (pies y cabeza) dentro del cuadro
 * Por fase: el último toque (saque / recepción-defensa / colocación / remate / balón libre / bloqueo) y de quién (n = nosotros, r = rival).
 * Modos (BOT): 'auto' (autopilot: la IA juega también por ti, como cam6test) o 'bot' (partido humano de verdad, Sim sin autopilot, con un
 * jugador sencillo en la página que mueve el stick hacia el balón cuando es suyo y si no a su sitio, y golpea en la ventana: llega tarde
 * a veces, como una persona). ROLE=OH|S|OPP|MB (bot). ZOOM=0..4 (si existe el ajuste camZoom). SHOTS=dir: capturas de los momentos con el
 * balón fuera del cuadro seguro (congela un instante, como cam6test). JSON=fichero: vuelca las cifras.
 * Uso: node tools/cam6ball.js [WxH=1280x720] [segundos=90] [semilla=11]   (TOUCH=1 táctil; BOT=auto|bot; SAFE=0.85; VB_ROOT=otra copia)
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const SIZE = process.argv[2] || '1280x720', SECS = +(process.argv[3] || 90), SEED = +(process.argv[4] || 11);
const BOT = process.env.BOT === 'bot' ? 'bot' : 'auto', ROLE = process.env.ROLE || 'OH', SAFE = +(process.env.SAFE || 0.85);
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : '', ZOOM = process.env.ZOOM;
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, SECS * 3000 + 120000).unref();
const HOOK = `(function(){
  var c=VB.ctx, CR=VB.CameraRig, S=VB.Sim, orig=CR.update, v=new c.THREE.Vector3(), SAFE=${SAFE};
  var CT=[${process.env.CAPT || ''}], M=window.__m={ph:{},pN:0,pOut:0,caps:[],err:''}, want=${SHOTS ? 'true' : 'false'}, capN=0, outRun=0, lastCapT=-9;
  function P(k){ var o=M.ph[k]; if(!o){ o=M.ph[k]={n:0,safe:0,edge:0,out:0,back:0,occ:0,px:[],up:0,dn:0,sd:0}; } return o; }
  function phase(g){
    if(g.mode==='serve') return g.serveState==='toss'?'lanz-'+(g.serving===0?'n':'r'):'';
    if(g.mode!=='rally') return '';
    var k=g.lastKind||'?'; if(k==='pass') k=(g.lastShot==='dig'?'defensa':'recep'); else if(k==='set') k='coloc'; else if(k==='spike') k='remate'; else if(k==='free') k='libre'; else if(k==='block') k='bloqueo'; else if(k==='serve') k='saque';
    return k+'-'+(g.lastTeam===0?'n':'r');
  }
  CR.update=function(g,dt,ev){ orig.apply(CR,arguments);
    try{
      if(c.frozen||!g||g.demo) return;
      var d=CR.getDebug(), shot=d.shot, cam=c.camera; cam.updateMatrixWorld(true);
      if(shot!=='tp') { outRun=0; return; }
      var ph=phase(g); if(!ph) return;
      var b=g.ball, o=P(ph), all=P('TOTAL'); o.n++; all.n++;
      VB.toThree(b.x,b.y,b.z,v); v.project(cam);
      var ax=Math.abs(v.x), ay=Math.abs(v.y), cls;
      if(v.z>1) cls='back'; else if(ax>1||ay>1) cls='out'; else if(ax>SAFE||ay>SAFE) cls='edge'; else cls='safe';
      o[cls]++; all[cls]++;
      if(cls==='out'||cls==='edge'){ var dk=ay>=ax?(v.y>0?'up':'dn'):'sd'; o[dk]++; all[dk]++; }
      // tamaño (px) y tapado por un atleta
      var cx=cam.position.x, cy=-cam.position.z, cz=cam.position.y, dx=b.x-cx, dy=b.y-cy, dz=b.z-cz, dl=Math.hypot(dx,dy,dz);
      if(cls==='safe'||cls==='edge'){
        var th=Math.tan(cam.fov*Math.PI/360), px=2*0.105/(dl*2*th)*c.height; if(o.px.length<4000) o.px.push(+px.toFixed(1)); if(all.px.length<20000) all.px.push(+px.toFixed(1));
        var occ=false;
        for(var t=0;t<2&&!occ;t++){ var tm=g.teams[t]; for(var i=0;i<tm.length;i++){ var q=tm[i];
          // punto del rayo más cercano al eje vertical del atleta (en planta), y altura del rayo ahí
          var qx=q.x-cx, qy=q.y-cy, hh=dx*dx+dy*dy; if(hh<1e-6) continue; var u=(qx*dx+qy*dy)/hh; if(u<=0.02||u>=0.97) continue;
          var ex=cx+dx*u-q.x, ey=cy+dy*u-q.y, rz=cz+dz*u, qz=Math.max(0,q.z||0);
          if(Math.hypot(ex,ey)<0.28&&rz>qz+0.1&&rz<qz+1.85){ occ=true; break; } } }
        if(occ){ o.occ++; all.occ++; }
      }
      if(cls!=='safe') outRun+=dt; else outRun=0;
      if(${process.env.LOG ? 'true' : 'false'}&&cls!=='safe'&&cls!=='edge'&&(M.lg=M.lg||[]).length<80) M.lg.push([ph,'b',b.x.toFixed(1),b.y.toFixed(1),b.z.toFixed(1),'v',b.vx.toFixed(0),b.vz.toFixed(0),'ndc',v.x.toFixed(2),v.y.toFixed(2),'cam',cx.toFixed(1),cz.toFixed(1),'fov',cam.fov.toFixed(0),'p',(d.pitch*57.3).toFixed(0),'ct',d.ct?d.ct.e.toFixed(1):'-','tf',d.tp?d.tp.fov.toFixed(0):'-','jug',g.ctrl.x.toFixed(1)].join(' '));
      // jugador
      if(g.ctrl){ M.pN++; var p=g.ctrl, bad=false; for(var h=0;h<2;h++){ VB.toThree(p.x,p.y,(p.z||0)+(h?1.85:0),v); v.project(cam); if(v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1) bad=true; } if(bad) M.pOut++; }
      for(var ci=0;ci<CT.length;ci++){ if(CT[ci]>0&&g.time>=CT[ci]&&!window.__cap){ window.__cap='t'+CT[ci]+'-'+ph+'-'+cls; CT[ci]=-1; c.frozen=true; M.caps.push(window.__cap); } }
      if(want&&outRun>0.2&&capN<14&&g.time-lastCapT>2.5&&!window.__cap){ lastCapT=g.time; capN++; window.__cap=ph+'-'+cls+'-t'+g.time.toFixed(1); c.frozen=true; M.caps.push(window.__cap); }
    }catch(err){ M.err=String(err&&err.stack||err); }
  };
  // JUGADOR SENCILLO (BOT=bot): stick hacia el balón si es suyo (focusPoint) y si no a su sitio (VB.AI6.spot); golpea en la ventana
  if('${BOT}'==='bot'){
    var IP=VB.Input.poll, srvT=0;
    VB.Input.poll=function(rdt){ var it=IP.apply(VB.Input,arguments); try{ var g=c.game; if(!g||g.demo||c.state!=='playing'||!it) return it; var p=g.ctrl; if(!p) return it;
      it.mx=0; it.my=0; it.hit=false; it.jump=false;
      if(g.mode==='serve'){ if(g.server===p){ if(g.serveState==='ready'&&g.serveAuth){ srvT+=rdt; if(srvT>0.8){ it.hit=true; srvT=0; } }
          else if(g.serveState==='toss'){ var w0=S.hitWindow(g,p); if(w0&&w0.t<0.03&&w0.t>-0.05) it.hit=true; } } return it; }
      if(g.mode!=='rally') return it;
      var job=g.jobs[0]===p, w=S.hitWindow(g,p), bs=CR.getBasis(), tg=job?S.focusPoint(g):VB.AI6.spot(g,p), dx=tg.x+(job?0.2:0)-p.x, dy=tg.y-p.y, d=Math.hypot(dx,dy);
      if(p.z<=0.05&&d>(job?0.4:0.5)){ var sx=dx*bs.rx+dy*bs.ry, sy=dx*bs.fx+dy*bs.fy, l=Math.hypot(sx,sy)||1, k=Math.min(1,0.4+d*0.4); it.mx=sx/l*k; it.my=sy/l*k; }
      if(job){ if(w.attack&&p.z===0&&w.jumpT<0.05&&w.jumpT>-0.1) it.jump=true; if((w.reach||w.canReach)&&w.press<0.02&&w.press>-0.06) it.hit=true; }
      if(!job&&p.front&&p.z===0&&g.touchTeam===1&&g.touches===2&&Math.abs(p.x)<1.4){ for(var i2=0;i2<g.teams[1].length;i2++){ var q2=g.teams[1][i2]; if(q2.z>0.4&&q2.vz<1.2&&Math.abs(q2.x)<4) it.jump=true; } }
    }catch(e){ M.err=String(e&&e.stack||e); } return it; };
  }
  ${process.env.TOUCH === '1' ? "try{ window.dispatchEvent(new TouchEvent('touchstart',{bubbles:true})); }catch(er){}" : ''}
  ${ZOOM != null ? 'try{ c.actions.setSetting&&c.actions.setSetting("camZoom",' + (+ZOOM) + '); }catch(e){}' : ''}
  c.actions.startMatch(${BOT === 'bot' ? "{format:'6v6',points:15}" : "{autopilot:true,format:'6v6',points:15}"});
  ${BOT === 'bot' ? "if(S.setCtrlRole) S.setCtrlRole(c.game,'" + ROLE + "');" : ''}
  return c.game.size+' '+(c.game.ctrl&&c.game.ctrl.role)+' zoom '+(c.settings.camZoom);
})()`;
function pct(a, p) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
(async () => {
  let page, out = {};
  try {
    page = await CDP.open({ size: SIZE, touch: process.env.TOUCH === '1' });
    await page.navigate('seed=' + SEED + '&cam6=3p&intro=0&wipe=0&noinstall=1&nonews=1'); await CDP.sleep(3000);
    // (partido humano: startMatch espera mientras dura el arranque, UI.bootBusy, hasta ~9 s)
    if (BOT === 'bot') for (let i = 0; i < 40 && (await page.evalJs('performance.now()<9500')); i++) await CDP.sleep(250);
    const info = await page.evalJs(HOOK);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const t0 = Date.now();
    while (Date.now() - t0 < SECS * 1000) {
      await CDP.sleep(50);
      const st = await page.evalJs('VB.ctx.state');
      if (st === 'paused') await page.evalJs('VB.ctx.actions.resume&&VB.ctx.actions.resume();1');
      else if (st !== 'playing') break;
      if (SHOTS) {
        const cap = await page.evalJs('window.__cap||""');
        if (cap) { await CDP.sleep(100); await page.shot(path.join(SHOTS, BOT + '-' + SIZE + (process.env.TOUCH === '1' ? 't' : '') + '-' + cap + '.png')); await page.evalJs('window.__cap="";VB.ctx.frozen=false;1'); }
      }
    }
    const M = await page.evalJs('JSON.stringify(window.__m)').then(JSON.parse);
    const sc = await page.evalJs('VB.ctx.game.score.join("-")+" sets "+VB.ctx.game.sets.join("-")');
    console.log('cam6ball ' + SIZE + (process.env.TOUCH === '1' ? ' táctil' : '') + ' ' + BOT + (BOT === 'bot' ? ' ' + ROLE : '') + ' semilla ' + SEED + ' (' + info + ') marcador ' + sc + ' cuadro seguro ±' + SAFE);
    if (M.err) console.log('ERROR sonda: ' + M.err);
    const keys = Object.keys(M.ph).sort((a, b) => a === 'TOTAL' ? 1 : b === 'TOTAL' ? -1 : M.ph[b].n - M.ph[a].n);
    console.log('fase           frames  seguro   borde   fuera  detrás  tapado  px p5/p50  (borde+fuera: arriba/abajo/lado)');
    for (const k of keys) {
      const o = M.ph[k], n = Math.max(1, o.n), f = x => (100 * x / n).toFixed(1).padStart(6) + '%';
      console.log(k.padEnd(14) + String(o.n).padStart(7) + ' ' + f(o.safe) + ' ' + f(o.edge) + ' ' + f(o.out) + ' ' + f(o.back) + ' ' + f(o.occ) + '  ' + pct(o.px, 0.05).toFixed(1) + '/' + pct(o.px, 0.5).toFixed(1) + '  ' + o.up + '/' + o.dn + '/' + o.sd);
      out[k] = { n: o.n, safe: o.safe / n, edge: o.edge / n, out: o.out / n, back: o.back / n, occ: o.occ / n, px5: pct(o.px, 0.05), px50: pct(o.px, 0.5) };
    }
    const pv = 1 - M.pOut / Math.max(1, M.pN);
    console.log('jugador en cuadro: ' + (100 * pv).toFixed(2) + ' % de ' + M.pN + ' frames');
    out.player = pv; out.size = SIZE; out.bot = BOT; out.seed = SEED;
    if (M.lg) console.log(M.lg.join(String.fromCharCode(10)));
    if (M.caps.length) console.log('capturas: ' + M.caps.join(', ') + ' → ' + SHOTS);
    if (page.errors.length) console.log('ERRORES de página: ' + page.errors.slice(0, 5).join(' | '));
    if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(out, null, 1));
  } catch (e) { console.error(e && e.stack || e); }
  if (page) page.close();
  process.exit(0);
})();
